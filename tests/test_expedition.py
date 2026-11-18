import json
from pathlib import Path
import runpy
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


class TreeMap(dict):
    @classmethod
    def __class_getitem__(cls, _):
        return cls


class UserError(Exception):
    pass


class ExpeditionTest(unittest.TestCase):
    def setUp(self):
        self.editor = "0x" + "1" * 40
        self.player = "0x" + "2" * 40
        self.other = "0x" + "3" * 40
        self.message = SimpleNamespace(sender_address=self.editor)
        self.consensus = []
        self.events = {
            "test1": self.event("test1", 137, 37),
            "test2": self.event("test2", 37, 37),
        }
        host = ModuleType("genlayer")
        host.TreeMap = TreeMap
        host.u32 = int
        host.allow_storage = lambda cls: cls
        host.gl = SimpleNamespace(
            Contract=object, message=self.message,
            public=SimpleNamespace(view=lambda method: method, write=lambda method: method),
            vm=SimpleNamespace(UserError=UserError),
            eq_principle=SimpleNamespace(strict_eq=self.verify),
            nondet=SimpleNamespace(web=SimpleNamespace(get=self.fetch)),
        )
        source = Path(__file__).resolve().parents[1] / "contracts" / "faultline_atlas_v2.py"
        with patch.dict(sys.modules, {"genlayer": host}):
            contract = runpy.run_path(str(source))["FaultlineAtlasV2"]
        self.app = contract()
        for name in ("expeditions", "events", "progress", "attempts", "passports"):
            setattr(self.app, name, TreeMap())

    def event(self, identifier, lon, lat):
        return {
            "id": identifier,
            "properties": {"status":"reviewed", "type":"earthquake", "place":"Test catalog", "time":1000, "mag":7.5},
            "geometry": {"type":"Point", "coordinates":[lon, lat, 10]},
        }

    def fetch(self, url):
        item = self.events.get(url.split("eventid=")[1])
        return SimpleNamespace(status=200 if item else 404, body=json.dumps(item))

    def verify(self, callback):
        observation = callback()
        self.consensus.append(json.loads(observation)["event"])
        return observation

    def open(self):
        self.app.open_expedition("atlas", "Exhibit", "test1,test2")

    def test_open_uses_independent_consensus_in_order(self):
        self.open()
        self.assertEqual(self.consensus, ["test1", "test2"])
        self.assertEqual(json.loads(self.app.get_expedition(self.editor, "atlas"))["total"], 2)
        self.assertEqual(json.loads(self.app.get_expedition_event(self.editor, "atlas", 1))["sector"], "N4")

    def test_invalid_catalog_data_does_not_open(self):
        for change, expected in [
            (lambda row: row["properties"].update(status="automatic"), "REVIEWED_EARTHQUAKE_REQUIRED"),
            (lambda row: row["geometry"].update(coordinates=[200, 12, 10]), "INVALID_CATALOG_COORDINATES"),
            (lambda row: row["properties"].pop("mag"), "INVALID_CATALOG_RECORD"),
        ]:
            self.events["test2"] = self.event("test2", 37, 37)
            change(self.events["test2"])
            with self.assertRaisesRegex(UserError, expected):
                self.open()
            self.assertEqual(self.app.get_expedition(self.editor, "atlas"), "")
            self.assertFalse(self.app.events)
        with self.assertRaisesRegex(UserError, "CATALOG_EVENT_UNAVAILABLE"):
            self.app.open_expedition("atlas", "Exhibit", "test1,test3")

    def test_duplicate_and_invalid_identifiers(self):
        for ids, reason in [("test1,test1", "DUPLICATE_EVENT"), ("test1,../test2", "INVALID_EVENT_LIST")]:
            with self.assertRaisesRegex(UserError, reason):
                self.app.open_expedition("atlas", "Exhibit", ids)

    def test_scoring_isolated_history_and_replay(self):
        self.open()
        with self.assertRaisesRegex(UserError, "HOST_CANNOT_PLAY"):
            self.app.plot(self.editor, "atlas", 0, "N6")
        self.message.sender_address = self.player
        for index, guess, reason in [
            (0, "Z0", "INVALID_SECTOR"), (2, "N6", "EVENT_NOT_IN_EXPEDITION"),
            (1, "N6", "EVENT_OUT_OF_SEQUENCE"),
        ]:
            with self.assertRaisesRegex(UserError, reason):
                self.app.plot(self.editor, "atlas", index, guess)
        self.app.plot(self.editor, "atlas", 0, "N6")
        self.assertEqual(self.app.get_expedition_result(self.editor, "atlas", self.player), "")
        partial = json.loads(self.app.get_player_progress(self.editor, "atlas", self.player))
        self.assertEqual((partial["status"], partial["played"]), ("OPEN", 1))
        self.app.plot(self.editor, "atlas", 1, "S1")
        result = self.app.get_expedition_result(self.editor, "atlas", self.player)
        self.assertEqual(json.loads(result)["accuracy_bps"], 5000)
        self.assertEqual(json.loads(result)["status"], "COMPLETED")
        self.assertEqual(json.loads(self.app.get_passport(self.editor, self.player)), {
            "completed":["atlas"], "played":2, "stamps":1,
        })
        with self.assertRaisesRegex(UserError, "ATTEMPT_ALREADY_RECORDED"):
            self.app.plot(self.editor, "atlas", 1, "N4")
        self.message.sender_address = self.other
        self.app.plot(self.editor, "atlas", 0, "S2")
        self.assertEqual(self.app.get_expedition_result(self.editor, "atlas", self.other), "")
        self.assertEqual(self.app.get_expedition_result(self.editor, "atlas", self.player), result)
        self.assertEqual(json.loads(self.app.get_expedition(self.editor, "atlas"))["status"], "OPEN")
