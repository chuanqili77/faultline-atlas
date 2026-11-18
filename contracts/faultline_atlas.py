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
    return pack({
        "event": event_id, "place": place, "time": time,
        "magnitude_tenths": quantize(properties["mag"], 10),
        "depth_tenths": quantize(depth, 10),
        "lat_milli": lat, "lon_milli": lon, "sector": sector(lat, lon),
    })


@allow_storage
class FaultlineAtlas(gl.Contract):
    rounds: TreeMap[str, str]
    event_index: TreeMap[str, str]
    attempts: TreeMap[str, str]
    passports: TreeMap[str, str]

    def __init__(self):
        pass

    @gl.public.view
    def get_round(self, host: str, slug: str) -> str:
        raw = self.rounds.get(host.lower() + "/" + slug, "")
        if not raw:
            return ""
        round_data = json.loads(raw)
        clues = {name: round_data[name] for name in ("time", "magnitude_tenths", "depth_tenths")}
        return pack(clues)

    @gl.public.view
    def get_attempt(self, host: str, slug: str, player: str) -> str:
        return self.attempts.get(host.lower() + "/" + slug + "/" + player.lower(), "")

    @gl.public.view
    def get_passport(self, host: str, player: str) -> str:
        return self.passports.get(host.lower() + "/" + player.lower(), "")

    @gl.public.write
    def open_round(self, slug: str, event_id: str) -> None:
        host = str(gl.message.sender_address).lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,39}", slug):
            raise gl.vm.UserError("INVALID_ROUND_NAME")
        if not re.fullmatch(r"[a-z0-9]{4,24}", event_id):
            raise gl.vm.UserError("INVALID_EVENT_ID")
        key = host + "/" + slug
        indexed = host + "/" + event_id
        if key in self.rounds or indexed in self.event_index:
            raise gl.vm.UserError("ROUND_OR_EVENT_ALREADY_USED")
        self.rounds[key] = gl.eq_principle.strict_eq(lambda: observe(event_id))
        self.event_index[indexed] = slug

    @gl.public.write
    def plot(self, host: str, slug: str, guess: str) -> None:
        host = host.lower()
        player = str(gl.message.sender_address).lower()
        if host == player:
            raise gl.vm.UserError("HOST_CANNOT_PLAY_OWN_ROUND")
        if not re.fullmatch(r"[NS][1-6]", guess):
            raise gl.vm.UserError("INVALID_SECTOR")
        key = host + "/" + slug
        raw = self.rounds.get(key, "")
        if not raw:
            raise gl.vm.UserError("ROUND_NOT_FOUND")
        attempt_key = key + "/" + player
        if attempt_key in self.attempts:
            raise gl.vm.UserError("ATTEMPT_ALREADY_RECORDED")
        evidence = json.loads(raw)
        correct = evidence["sector"] == guess
        self.attempts[attempt_key] = pack({"guess": guess, "correct": correct, "evidence": evidence})
        passport_key = host + "/" + player
        score = json.loads(self.passports.get(passport_key, '{"played":0,"stamps":0}'))
        score["played"] += 1
        if correct:
            score["stamps"] += 1
        self.passports[passport_key] = pack(score)
