#!/usr/bin/env python3
"""
Test suite for Picksheet Ingestion Service

Tests the FastAPI service endpoints and parsing logic.
"""

import pytest
from fastapi.testclient import TestClient
from picksheet_service import app, ParseRequest, PickRow


# Test client for FastAPI
client = TestClient(app)


# ============================================================================
# TEST DATA
# ============================================================================

SAMPLE_PICKSHEET = """1 pt 	Dallas (3-5-1) +7.5	Thu 5:20 PM	PHILADELPHIA (7-2) -7.5
1 pt 	#24 James Madison (8-1) +14.5	Fri 4:00 PM	#19 LOUISVILLE (7-3) -14.5
1 pt 	Kansas City (5-4) -3.5	Fri 5:00 PM	LA CHARGERS (7-3) +3.5
1 pt 	Buffalo (6-3) +2.5	Sun 10:00 AM	ATLANTA (3-6) -2.5"""


# ============================================================================
# HEALTH CHECK TESTS
# ============================================================================

def test_health_check():
    """Test the health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "timestamp" in data


# ============================================================================
# PARSE ENDPOINT TESTS
# ============================================================================

def test_parse_endpoint_success():
    """Test successful parsing of picksheet text"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025,
        "week": 1
    }

    response = client.post("/parse", json=request_data)
    assert response.status_code == 200

    data = response.json()
    assert "picks" in data
    assert "total_lines" in data
    assert "successful_parses" in data
    assert data["total_lines"] == 4
    assert data["successful_parses"] > 0


def test_parse_endpoint_with_league_filter():
    """Test parsing with league filter"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025,
        "week": 1,
        "league": "NFL"
    }

    response = client.post("/parse", json=request_data)
    assert response.status_code == 200

    data = response.json()
    picks = data["picks"]

    # All picks should be NFL
    for pick in picks:
        assert pick["league"] == "NFL"


def test_parse_endpoint_empty_text():
    """Test parsing with empty text"""
    request_data = {
        "text": "",
        "season": 2025
    }

    # FastAPI should reject empty text (min_length=1)
    response = client.post("/parse", json=request_data)
    assert response.status_code == 422  # Validation error


def test_parse_endpoint_invalid_season():
    """Test parsing with invalid season"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 1999  # Invalid (< 2000)
    }

    response = client.post("/parse", json=request_data)
    assert response.status_code == 422  # Validation error


# ============================================================================
# BATCH PARSE TESTS
# ============================================================================

def test_batch_parse_endpoint():
    """Test batch parsing of multiple picksheets"""
    request_data = {
        "picksheets": [
            {
                "text": SAMPLE_PICKSHEET,
                "season": 2025,
                "week": 1
            },
            {
                "text": SAMPLE_PICKSHEET,
                "season": 2025,
                "week": 2
            }
        ]
    }

    response = client.post("/parse/batch", json=request_data)
    assert response.status_code == 200

    data = response.json()
    assert "results" in data
    assert "total_picksheets" in data
    assert "total_picks" in data
    assert data["total_picksheets"] == 2
    assert len(data["results"]) == 2


# ============================================================================
# PARSING LOGIC TESTS
# ============================================================================

def test_nfl_game_parsing():
    """Test parsing of NFL game"""
    nfl_line = "1 pt 	Dallas (3-5-1) +7.5	Thu 5:20 PM	PHILADELPHIA (7-2) -7.5"

    request_data = {
        "text": nfl_line,
        "season": 2025,
        "week": 1
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    assert len(data["picks"]) == 1
    pick = data["picks"][0]

    # Check basic fields
    assert pick["league"] == "NFL"
    assert pick["season"] == 2025
    assert pick["week"] == 1

    # Check teams
    assert "Dallas" in pick["away_team"] or "Cowboys" in pick["away_team"]
    assert "Philadelphia" in pick["home_team"] or "Eagles" in pick["home_team"]

    # Check spreads
    assert pick["away_spread"] == 7.5
    assert pick["home_spread"] == -7.5

    # Check time
    assert pick["event_time"] == "17:20"  # 5:20 PM in 24-hour format

    # Check point value
    assert pick["point_value"] == 1


def test_ncaaf_game_parsing():
    """Test parsing of NCAAF game with rankings"""
    ncaaf_line = "1 pt 	#24 James Madison (8-1) +14.5	Fri 4:00 PM	#19 LOUISVILLE (7-3) -14.5"

    request_data = {
        "text": ncaaf_line,
        "season": 2025,
        "week": 1
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    assert len(data["picks"]) == 1
    pick = data["picks"][0]

    # NCAAF should be detected from rankings
    assert pick["league"] == "NCAAF"

    # Rankings should be stripped from team names
    assert "#24" not in pick["away_team"]
    assert "#19" not in pick["home_team"]
    assert "James Madison" in pick["away_team"]
    assert "Louisville" in pick["home_team"]


def test_spread_validation():
    """Test that spreads are validated correctly"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    for pick in data["picks"]:
        # Home and away spreads should sum to 0 (within tolerance)
        if pick["home_spread"] is not None and pick["away_spread"] is not None:
            spread_sum = abs(pick["home_spread"] + pick["away_spread"])
            assert spread_sum < 0.01, f"Invalid spreads: {pick['home_spread']} + {pick['away_spread']}"


def test_confidence_scoring():
    """Test confidence scores are assigned"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    for pick in data["picks"]:
        assert 0.0 <= pick["confidence"] <= 1.0

        # Picks with all data should have high confidence
        if all([
            pick["away_team"],
            pick["home_team"],
            pick["away_spread"] is not None,
            pick["home_spread"] is not None,
            pick["event_time"]
        ]):
            assert pick["confidence"] >= 0.7


# ============================================================================
# EDGE CASES
# ============================================================================

def test_empty_lines_skipped():
    """Test that empty lines are skipped"""
    text_with_empty_lines = """
1 pt 	Dallas (3-5-1) +7.5	Thu 5:20 PM	PHILADELPHIA (7-2) -7.5

1 pt 	Kansas City (5-4) -3.5	Fri 5:00 PM	LA CHARGERS (7-3) +3.5

"""

    request_data = {
        "text": text_with_empty_lines,
        "season": 2025
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    # Should parse 2 games despite empty lines
    assert data["successful_parses"] == 2


def test_header_lines_skipped():
    """Test that header lines are skipped"""
    text_with_headers = """NFL Week 1
Sunday, January 5, 2025

1 pt 	Dallas (3-5-1) +7.5	Thu 5:20 PM	PHILADELPHIA (7-2) -7.5
1 pt 	Kansas City (5-4) -3.5	Fri 5:00 PM	LA CHARGERS (7-3) +3.5"""

    request_data = {
        "text": text_with_headers,
        "season": 2025
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    # Should parse 2 games, skipping headers
    assert data["successful_parses"] == 2


# ============================================================================
# METADATA TESTS
# ============================================================================

def test_response_metadata():
    """Test that response includes metadata"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025,
        "week": 1
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    assert "metadata" in data
    metadata = data["metadata"]

    assert "parse_time_ms" in metadata
    assert "timestamp" in metadata
    assert metadata["season"] == 2025
    assert metadata["week"] == 1


def test_raw_text_preserved():
    """Test that raw text is preserved in picks"""
    request_data = {
        "text": SAMPLE_PICKSHEET,
        "season": 2025
    }

    response = client.post("/parse", json=request_data)
    data = response.json()

    for pick in data["picks"]:
        assert pick["raw_text"]
        assert len(pick["raw_text"]) > 0


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
