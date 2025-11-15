#!/usr/bin/env python3
"""
Picksheet Ingestion Service - FastAPI Service

A RESTful API service that ingests raw picksheet text, applies normalization rules,
and outputs structured data as `picks_rows`.

API Endpoints:
- POST /parse - Parse raw picksheet text
- POST /parse/batch - Parse multiple picksheet files
- GET /health - Health check

Data Models:
- ParseRequest: Input model for raw text
- PickRow: Single pick/game output model
- ParseResponse: Complete response with all parsed picks
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from enum import Enum

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import uvicorn

from picksheet_normalizer import PicksheetNormalizer, NormalizedGame


# ============================================================================
# DATA MODELS
# ============================================================================

class League(str, Enum):
    """Supported leagues"""
    NFL = "NFL"
    NCAAF = "NCAAF"
    UNKNOWN = "UNKNOWN"


class PickRow(BaseModel):
    """
    Single pick/game row output structure

    Represents a normalized game with all relevant data extracted
    from the picksheet text.
    """
    # Game identification
    league: League = Field(default=League.UNKNOWN, description="League (NFL or NCAAF)")
    season: int = Field(..., description="Season year (e.g., 2025)")
    week: Optional[int] = Field(None, description="Week number (1-18 for NFL)")

    # Game details
    event_date: Optional[str] = Field(None, description="Game date in ISO format (YYYY-MM-DD)")
    event_time: Optional[str] = Field(None, description="Game time in 24-hour format (HH:MM)")

    # Teams
    home_team: str = Field(..., description="Normalized home team name")
    away_team: str = Field(..., description="Normalized away team name")

    # Spreads and lines
    home_spread: Optional[float] = Field(None, description="Home team spread")
    away_spread: Optional[float] = Field(None, description="Away team spread")
    total: Optional[float] = Field(None, description="Over/Under total points")

    # Point value (for office pool scoring)
    point_value: int = Field(default=1, description="Point value for pick")

    # Metadata
    raw_text: str = Field(..., description="Original unparsed text line")
    line_number: int = Field(..., description="Line number in source file")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0, description="Parsing confidence score")
    warnings: List[str] = Field(default_factory=list, description="Parsing warnings")

    class Config:
        json_schema_extra = {
            "example": {
                "league": "NFL",
                "season": 2025,
                "week": 1,
                "event_date": "2025-01-09",
                "event_time": "17:20",
                "home_team": "Philadelphia Eagles",
                "away_team": "Dallas Cowboys",
                "home_spread": -7.5,
                "away_spread": 7.5,
                "total": None,
                "point_value": 1,
                "raw_text": "1 pt Dallas (3-5-1) +7.5 Thu 5:20 PM PHILADELPHIA (7-2) -7.5",
                "line_number": 1,
                "confidence": 0.95,
                "warnings": []
            }
        }


class ParseRequest(BaseModel):
    """Request model for parsing picksheet text"""
    text: str = Field(..., min_length=1, description="Raw picksheet text to parse")
    season: int = Field(default=2025, ge=2000, le=2100, description="Season year")
    week: Optional[int] = Field(None, ge=1, le=18, description="Week number")
    league: Optional[League] = Field(None, description="League filter (NFL or NCAAF)")

    class Config:
        json_schema_extra = {
            "example": {
                "text": "1 pt Dallas (3-5-1) +7.5 Thu 5:20 PM PHILADELPHIA (7-2) -7.5\n1 pt Kansas City (5-4) -3.5 Fri 5:00 PM LA CHARGERS (7-3) +3.5",
                "season": 2025,
                "week": 1,
                "league": "NFL"
            }
        }


class ParseResponse(BaseModel):
    """Response model for parsed picksheet"""
    picks: List[PickRow] = Field(..., description="List of parsed pick rows")
    total_lines: int = Field(..., description="Total lines processed")
    successful_parses: int = Field(..., description="Number of successfully parsed lines")
    failed_lines: List[int] = Field(default_factory=list, description="Line numbers that failed to parse")
    errors: List[str] = Field(default_factory=list, description="Error messages")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "picks": [],
                "total_lines": 68,
                "successful_parses": 68,
                "failed_lines": [],
                "errors": [],
                "metadata": {
                    "parse_time_ms": 125,
                    "timestamp": "2025-11-15T10:00:00Z"
                }
            }
        }


class BatchParseRequest(BaseModel):
    """Request model for batch parsing multiple picksheets"""
    picksheets: List[ParseRequest] = Field(..., min_items=1, description="List of picksheets to parse")


class BatchParseResponse(BaseModel):
    """Response model for batch parsing"""
    results: List[ParseResponse] = Field(..., description="Parse results for each picksheet")
    total_picksheets: int = Field(..., description="Total number of picksheets processed")
    total_picks: int = Field(..., description="Total picks across all picksheets")


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(default="healthy")
    version: str = Field(default="1.0.0")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============================================================================
# FASTAPI APPLICATION
# ============================================================================

app = FastAPI(
    title="Picksheet Ingestion Service",
    description="Parse and normalize picksheet text into structured data",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# PARSER IMPLEMENTATION
# ============================================================================

class PicksheetParser:
    """
    Main parser class that coordinates normalization and structuring
    """

    def __init__(self):
        self.normalizer = PicksheetNormalizer()

    def parse_line(self, line: str, line_number: int, season: int, week: Optional[int] = None) -> Optional[PickRow]:
        """
        Parse a single picksheet line into a PickRow

        Line format:
        "1 pt  Dallas (3-5-1) +7.5  Thu 5:20 PM  PHILADELPHIA (7-2) -7.5"

        Returns:
            PickRow if successfully parsed, None if line should be skipped
        """
        line = line.strip()

        # Skip empty lines and headers
        if not line or line.startswith('#') or 'NFL' in line or 'NCAAF' in line:
            return None

        warnings = []

        # TODO: Implement full line parsing logic
        # This is a placeholder implementation

        # Split by tabs (the file uses tabs as separators)
        parts = [p.strip() for p in line.split('\t') if p.strip()]

        if len(parts) < 3:
            # Not enough parts to parse
            return None

        try:
            # Extract components
            # Format: "1 pt " | "Dallas (3-5-1) +7.5" | "Thu 5:20 PM" | "PHILADELPHIA (7-2) -7.5"
            # Parts: [0] point value, [1] away team+spread, [2] time, [3] home team+spread
            if len(parts) == 4:
                point_value_part = parts[0]  # "1 pt"
                away_part = parts[1]  # Away team and spread
                time_part = parts[2]  # Game time
                home_part = parts[3]  # Home team and spread
            elif len(parts) == 3:
                # No point value
                away_part = parts[0]
                time_part = parts[1]
                home_part = parts[2]
                point_value_part = ""
            else:
                # Not enough parts
                return None

            # Parse point value
            point_value = 1
            if point_value_part and 'pt' in point_value_part.lower():
                point_value = self._extract_point_value(point_value_part)

            # Parse teams and spreads
            away_team, away_spread = self._extract_team_and_spread(away_part)
            home_team, home_spread = self._extract_team_and_spread(home_part)

            # Normalize team names
            away_team = self.normalizer.normalize_team_name(away_team)
            home_team = self.normalizer.normalize_team_name(home_team)

            # Parse date and time
            event_date = self.normalizer.parse_date(time_part)
            event_time = self.normalizer.parse_time(time_part)

            # Detect league based on team names (CAPS = NFL, Title Case = NCAAF)
            league = self._detect_league(home_team, away_team, home_part, away_part)

            # Validate spreads
            if not self.normalizer.validate_spreads(home_spread, away_spread):
                warnings.append(f"Spread validation failed: {home_spread} + {away_spread} != 0")

            # Calculate confidence
            confidence = self._calculate_confidence(
                away_team, home_team, away_spread, home_spread, event_date, event_time
            )

            return PickRow(
                league=league,
                season=season,
                week=week,
                event_date=event_date,
                event_time=event_time,
                home_team=home_team,
                away_team=away_team,
                home_spread=home_spread,
                away_spread=away_spread,
                total=None,  # Not present in current format
                point_value=point_value,
                raw_text=line,
                line_number=line_number,
                confidence=confidence,
                warnings=warnings
            )

        except Exception as e:
            # Return None for failed parses, error will be tracked separately
            return None

    def _extract_point_value(self, text: str) -> int:
        """Extract point value from text like '1 pt' or '2 pt'"""
        import re
        match = re.search(r'(\d+)\s*pt', text, re.IGNORECASE)
        if match:
            return int(match.group(1))
        return 1

    def _extract_team_and_spread(self, text: str) -> tuple[str, Optional[float]]:
        """
        Extract team name and spread from text like 'Dallas (3-5-1) +7.5'

        Returns:
            Tuple of (team_name, spread)
        """
        import re

        # Look for spread at the end: +7.5, -14, PK, etc.
        # The spread should be the last token that's either +/- number or PK
        spread_match = re.search(r'\s+([+-]?\d+\.?\d*)\s*$', text)
        if not spread_match:
            # Try PK/pick'em
            spread_match = re.search(r'\s+(pk|PK|pick|PICK|even|EVEN)\s*$', text, re.IGNORECASE)

        if spread_match:
            spread_text = spread_match.group(1)
            spread = self.normalizer.parse_spread(spread_text)
            # Remove the spread from the text
            team_text = text[:spread_match.start()].strip()
        else:
            # No spread found
            spread = None
            team_text = text.strip()

        return team_text, spread

    def _detect_league(self, home_team: str, away_team: str, home_raw: str, away_raw: str) -> League:
        """
        Detect league based on team name patterns

        NFL teams are typically in ALL CAPS in the raw text
        NCAAF teams have mixed case
        """
        # Check if raw text has rankings (indicates NCAAF)
        if '#' in home_raw or '#' in away_raw:
            return League.NCAAF

        # Extract just the team name portion (before record and spread)
        # Look for the first word that's all caps with length > 2
        import re
        home_words = home_raw.split()
        for word in home_words:
            # Skip point values, numbers, and short words
            if word.lower().startswith(('pt', 'pm', 'am')) or word.isdigit() or len(word) <= 2:
                continue
            # Check if it's all caps (indicates NFL)
            if word.replace('(', '').replace(')', '').isupper():
                return League.NFL

        # Check against known NFL teams
        home_upper = home_team.upper()
        away_upper = away_team.upper()
        for nfl_team_key in self.normalizer.NFL_TEAMS.keys():
            if nfl_team_key in home_upper or nfl_team_key in away_upper:
                return League.NFL

        # If we see common NFL city names
        nfl_cities = ['BUFFALO', 'MIAMI', 'DALLAS', 'PHILADELPHIA', 'KANSAS CITY',
                     'CHARGERS', 'ATLANTA', 'PITTSBURGH', 'JETS', 'BALTIMORE',
                     'CINCINNATI', 'CLEVELAND', 'INDIANAPOLIS', 'SEATTLE', 'DENVER',
                     'GREEN BAY', 'RAMS']
        for city in nfl_cities:
            if city in home_raw.upper() or city in away_raw.upper():
                return League.NFL

        return League.UNKNOWN

    def _calculate_confidence(
        self,
        away_team: str,
        home_team: str,
        away_spread: Optional[float],
        home_spread: Optional[float],
        event_date: Optional[str],
        event_time: Optional[str]
    ) -> float:
        """
        Calculate confidence score based on parsed data quality

        Returns:
            Float between 0.0 and 1.0
        """
        score = 1.0

        # Penalize missing data
        if not away_team or not home_team:
            score -= 0.5
        if away_spread is None or home_spread is None:
            score -= 0.2
        if not event_date:
            score -= 0.1
        if not event_time:
            score -= 0.1

        # Penalize invalid spreads
        if away_spread is not None and home_spread is not None:
            if not self.normalizer.validate_spreads(home_spread, away_spread):
                score -= 0.2

        return max(0.0, min(1.0, score))

    def parse_text(self, text: str, season: int, week: Optional[int] = None) -> ParseResponse:
        """
        Parse complete picksheet text

        Args:
            text: Raw picksheet text (multiline)
            season: Season year
            week: Week number (optional)

        Returns:
            ParseResponse with all parsed picks
        """
        start_time = datetime.now(timezone.utc)

        lines = text.split('\n')
        picks = []
        failed_lines = []
        errors = []

        for line_number, line in enumerate(lines, start=1):
            try:
                pick = self.parse_line(line, line_number, season, week)
                if pick:
                    picks.append(pick)
            except Exception as e:
                failed_lines.append(line_number)
                errors.append(f"Line {line_number}: {str(e)}")

        end_time = datetime.now(timezone.utc)
        parse_time_ms = int((end_time - start_time).total_seconds() * 1000)

        return ParseResponse(
            picks=picks,
            total_lines=len(lines),
            successful_parses=len(picks),
            failed_lines=failed_lines,
            errors=errors,
            metadata={
                "parse_time_ms": parse_time_ms,
                "timestamp": end_time.isoformat() + "Z",
                "season": season,
                "week": week
            }
        )


# ============================================================================
# API ENDPOINTS
# ============================================================================

# Initialize parser
parser = PicksheetParser()


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint

    Returns service status and version information.
    """
    return HealthResponse()


@app.post("/parse", response_model=ParseResponse, tags=["Parsing"])
async def parse_picksheet(request: ParseRequest):
    """
    Parse a single picksheet text

    Accepts raw picksheet text and returns structured pick rows.
    Each row contains normalized team names, spreads, dates, and times.
    """
    try:
        result = parser.parse_text(
            text=request.text,
            season=request.season,
            week=request.week
        )

        # Filter by league if specified
        if request.league:
            result.picks = [p for p in result.picks if p.league == request.league]
            result.successful_parses = len(result.picks)

        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing picksheet: {str(e)}"
        )


@app.post("/parse/batch", response_model=BatchParseResponse, tags=["Parsing"])
async def parse_picksheets_batch(request: BatchParseRequest):
    """
    Parse multiple picksheets in a single request

    Useful for bulk processing of multiple weeks or files.
    """
    try:
        results = []
        total_picks = 0

        for picksheet_request in request.picksheets:
            result = parser.parse_text(
                text=picksheet_request.text,
                season=picksheet_request.season,
                week=picksheet_request.week
            )

            # Filter by league if specified
            if picksheet_request.league:
                result.picks = [p for p in result.picks if p.league == picksheet_request.league]
                result.successful_parses = len(result.picks)

            results.append(result)
            total_picks += len(result.picks)

        return BatchParseResponse(
            results=results,
            total_picksheets=len(request.picksheets),
            total_picks=total_picks
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error parsing picksheets: {str(e)}"
        )


# ============================================================================
# MAIN
# ============================================================================

def main():
    """Run the FastAPI service"""
    uvicorn.run(
        "picksheet_service:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
