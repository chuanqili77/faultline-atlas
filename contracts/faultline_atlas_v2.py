# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from decimal import Decimal, ROUND_HALF_UP
import json
import re

USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid="


def pack(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def quantize(value, scale):
    if type(value) not in (int, Decimal):
        raise gl.vm.UserError("INVALID_CATALOG_NUMBER")
    return int((Decimal(value) * scale).to_integral_value(rounding=ROUND_HALF_UP))


def sector(lat, lon):
    return ("N" if lat >= 0 else "S") + str(min((lon + 180000) // 60000, 5) + 1)


def observe(event_id):
    try:
        return normalize_event(event_id)
    except (KeyError, TypeError, ValueError, ArithmeticError):
        raise gl.vm.UserError("INVALID_CATALOG_RECORD")


def normalize_event(event_id):
    response = gl.nondet.web.get(USGS + event_id)
    if response.status != 200:
        raise gl.vm.UserError("CATALOG_EVENT_UNAVAILABLE")
    item = json.loads(response.body, parse_float=Decimal)
    properties = item["properties"]
    if item["id"] != event_id or properties["status"] != "reviewed" or properties["type"] != "earthquake":
        raise gl.vm.UserError("REVIEWED_EARTHQUAKE_REQUIRED")
    geometry = item["geometry"]
    if geometry["type"] != "Point" or len(geometry["coordinates"]) != 3:
        raise gl.vm.UserError("INVALID_CATALOG_COORDINATES")
    lon, lat, depth = geometry["coordinates"]
    lat, lon = quantize(lat, 1000), quantize(lon, 1000)
    if not -90000 <= lat <= 90000 or not -180000 <= lon <= 180000:
        raise gl.vm.UserError("INVALID_CATALOG_COORDINATES")
    place = properties["place"]
    time = properties["time"]
    if not isinstance(place, str) or not 0 < len(place) <= 200 or type(time) is not int or time <= 0:
        raise gl.vm.UserError("INVALID_CATALOG_RECORD")
    magnitude = quantize(properties["mag"], 10)
    depth_tenths = quantize(depth, 10)
    if not -100 <= magnitude <= 120 or not -1000 <= depth_tenths <= 10000:
        raise gl.vm.UserError("INVALID_CATALOG_MEASUREMENTS")
    return pack({
        "event": event_id, "place": place, "time": time,
        "magnitude_tenths": magnitude,
        "depth_tenths": depth_tenths,
        "lat_milli": lat, "lon_milli": lon, "sector": sector(lat, lon),
    })


@allow_storage
class FaultlineAtlasV2(gl.Contract):
    expeditions: TreeMap[str, str]
    events: TreeMap[str, str]
    progress: TreeMap[str, str]
    attempts: TreeMap[str, str]
    passports: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def get_expedition(self, host: str, slug: str) -> str:
        return self.expeditions.get(host.lower() + "/" + slug, "")

    @gl.public.view
    def get_expedition_event(self, host: str, slug: str, index: u32) -> str:
        return self.events.get(host.lower() + "/" + slug + "/" + str(index), "")

    @gl.public.view
    def get_player_progress(self, host: str, slug: str, player: str) -> str:
        return self.progress.get(host.lower() + "/" + slug + "/" + player.lower(), "")

    @gl.public.view
    def get_attempt(self, host: str, slug: str, player: str, index: u32) -> str:
        key = host.lower() + "/" + slug + "/" + player.lower() + "/" + str(index)
        return self.attempts.get(key, "")

    @gl.public.view
    def get_passport(self, host: str, player: str) -> str:
        return self.passports.get(host.lower() + "/" + player.lower(), "")

    @gl.public.view
    def get_expedition_result(self, host: str, slug: str, player: str) -> str:
        key = host.lower() + "/" + slug
        player_key = key + "/" + player.lower()
        raw = self.progress.get(player_key, "")
        if not raw:
            return ""
        progress = json.loads(raw)
        if progress["status"] != "COMPLETED":
            return ""
        expedition = json.loads(self.expeditions[key])
        attempts = []
        for index in range(expedition["total"]):
            suffix = "/" + str(index)
            attempts.append({
                "observation": json.loads(self.events[key + suffix]),
                "attempt": json.loads(self.attempts[player_key + suffix]),
            })
        return pack(dict(progress, title=expedition["title"], rounds=attempts))

    @gl.public.write
    def open_expedition(self, slug: str, title: str, event_ids: str) -> None:
        host = str(gl.message.sender_address).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,39}", slug) or not 0 < len(title.strip()) <= 100:
            raise gl.vm.UserError("INVALID_EXPEDITION")
        if not re.fullmatch(r"[a-z0-9]{4,24}(,[a-z0-9]{4,24}){1,4}", event_ids):
            raise gl.vm.UserError("INVALID_EVENT_LIST")
        ids = event_ids.split(",")
        if len(set(ids)) != len(ids):
            raise gl.vm.UserError("DUPLICATE_EVENT")
        key = host + "/" + slug
        if key in self.expeditions:
            raise gl.vm.UserError("EXPEDITION_ALREADY_EXISTS")
        observations = []
        for event_id in ids:
            def read_event():
                return observe(event_id)
            observations.append(gl.eq_principle.strict_eq(read_event))
        for index, observation in enumerate(observations):
            self.events[key + "/" + str(index)] = observation
        self.expeditions[key] = pack({"title": title.strip(), "status": "OPEN", "total": len(ids)})

    @gl.public.write
    def plot(self, host: str, slug: str, index: u32, guess: str) -> None:
        host = host.lower()
        player = str(gl.message.sender_address).lower()
        if host == player:
            raise gl.vm.UserError("HOST_CANNOT_PLAY_OWN_EXPEDITION")
        if not re.fullmatch(r"[NS][1-6]", guess):
            raise gl.vm.UserError("INVALID_SECTOR")
        key = host + "/" + slug
        expedition = self.expeditions.get(key, "")
        if not expedition:
            raise gl.vm.UserError("EXPEDITION_NOT_FOUND")
        total = json.loads(expedition)["total"]
        if not 0 <= index < total:
            raise gl.vm.UserError("EVENT_NOT_IN_EXPEDITION")
        player_key = key + "/" + player
        attempt_key = player_key + "/" + str(index)
        if attempt_key in self.attempts:
            raise gl.vm.UserError("ATTEMPT_ALREADY_RECORDED")
        progress = json.loads(self.progress.get(player_key, '{"played":0,"correct":0}'))
        if index != progress["played"]:
            raise gl.vm.UserError("EVENT_OUT_OF_SEQUENCE")
        event = json.loads(self.events[key + "/" + str(index)])
        correct = int(guess == event["sector"])
        progress["played"] += 1
        progress["correct"] += correct
        progress["wrong"] = progress["played"] - progress["correct"]
        progress["total"] = total
        progress["accuracy_bps"] = 10000 * progress["correct"] // progress["played"]
        complete = progress["played"] == total
        progress["status"] = "COMPLETED" if complete else "OPEN"
        passport_key = host + "/" + player
        passport = json.loads(self.passports.get(passport_key, '{"played":0,"stamps":0,"completed":[]}'))
        passport["played"] += 1
        passport["stamps"] += correct
        if complete:
            passport["completed"].append(slug)
        self.attempts[attempt_key] = pack({"guess": guess, "correct": bool(correct)})
        self.progress[player_key] = pack(progress)
        self.passports[passport_key] = pack(passport)
