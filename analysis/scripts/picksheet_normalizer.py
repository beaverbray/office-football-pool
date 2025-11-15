#!/usr/bin/env python3
"""
Picksheet Normalizer - Normalization Rules for Picksheet Parsing

This module provides comprehensive normalization rules for parsing picksheet text
to ensure consistent data formats across different picksheet sources.

Features:
- Regex patterns for stripping rankings and records
- Team abbreviation mapping and unification
- Date format standardization
- Spread parsing and validation
- Time format conversion
"""

import re
from datetime import datetime
from typing import Optional, Dict, Tuple, List
from dataclasses import dataclass


@dataclass
class NormalizedGame:
    """Normalized game data structure"""
    league: Optional[str] = None
    event_date: Optional[str] = None  # ISO format: YYYY-MM-DD
    event_time: Optional[str] = None  # 24-hour format: HH:MM
    home_team: str = ""
    away_team: str = ""
    home_spread: Optional[float] = None
    away_spread: Optional[float] = None
    total: Optional[float] = None
    raw_text: str = ""
    metadata: Dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class PicksheetNormalizer:
    """
    Comprehensive normalization engine for picksheet parsing

    Applies regex patterns and tokenization techniques to:
    - Strip rankings (#1, #24, etc.)
    - Remove records ((7-10), (8-1), etc.)
    - Unify team abbreviations
    - Standardize date formats
    - Parse and validate spreads
    """

    # ============================================================================
    # REGEX PATTERNS - Rankings and Records
    # ============================================================================

    # Pattern 1: Strip rankings (e.g., "#11 ", "#24 ", "11 ")
    RANKING_PATTERN = re.compile(r'^#?\d+\s+')

    # Pattern 2: Strip records in parentheses (e.g., "(10-2)", "(7-5-1)")
    RECORD_PATTERN = re.compile(r'\s*\(\d+-\d+(?:-\d+)?\)\s*')

    # Pattern 3: Strip records in brackets (e.g., "[10-2]")
    BRACKET_RECORD_PATTERN = re.compile(r'\s*\[\d+-\d+(?:-\d+)?\]\s*')

    # Pattern 4: Point values (e.g., "1 pt ", "2 pt ")
    POINT_VALUE_PATTERN = re.compile(r'^\s*\d+\s+pt\s+', re.IGNORECASE)

    # ============================================================================
    # TEAM ABBREVIATION MAPPING
    # ============================================================================

    # Comprehensive abbreviation to full name mapping
    ABBREVIATIONS = {
        # Directional abbreviations
        'St.': 'State',
        'St': 'State',
        'U.': 'University',
        'U': 'University',
        'So.': 'Southern',
        'So': 'Southern',
        'No.': 'Northern',
        'No': 'Northern',
        'E.': 'Eastern',
        'E': 'Eastern',
        'W.': 'Western',
        'W': 'Western',
        'C.': 'Central',
        'C': 'Central',

        # State abbreviations
        'Miss.': 'Mississippi',
        'Miss': 'Mississippi',
        'Mich.': 'Michigan',
        'Mich': 'Michigan',
        'Okla.': 'Oklahoma',
        'Okla': 'Oklahoma',
        'Tenn.': 'Tennessee',
        'Tenn': 'Tennessee',
        'Ala.': 'Alabama',
        'Ala': 'Alabama',
        'Ark.': 'Arkansas',
        'Ark': 'Arkansas',
        'La.': 'Louisiana',
        'La': 'Louisiana',
        'Va.': 'Virginia',
        'Va': 'Virginia',
        'Ga.': 'Georgia',
        'Ga': 'Georgia',
        'Fla.': 'Florida',
        'Fla': 'Florida',
        'N.C.': 'North Carolina',
        'NC': 'North Carolina',
        'S.C.': 'South Carolina',
        'SC': 'South Carolina',
        'Atl.': 'Atlantic',
        'Atl': 'Atlantic',

        # Special cases
        '49ERS': '49ers',
        '49ers': '49ers',
    }

    # NFL team name standardization
    NFL_TEAMS = {
        # AFC East
        'BUFFALO': 'Buffalo Bills',
        'MIAMI': 'Miami Dolphins',
        'NEW ENGLAND': 'New England Patriots',
        'NY JETS': 'New York Jets',

        # AFC North
        'BALTIMORE': 'Baltimore Ravens',
        'CINCINNATI': 'Cincinnati Bengals',
        'CLEVELAND': 'Cleveland Browns',
        'PITTSBURGH': 'Pittsburgh Steelers',

        # AFC South
        'HOUSTON': 'Houston Texans',
        'INDIANAPOLIS': 'Indianapolis Colts',
        'JACKSONVILLE': 'Jacksonville Jaguars',
        'TENNESSEE': 'Tennessee Titans',

        # AFC West
        'DENVER': 'Denver Broncos',
        'KANSAS CITY': 'Kansas City Chiefs',
        'LAS VEGAS': 'Las Vegas Raiders',
        'LA CHARGERS': 'Los Angeles Chargers',

        # NFC East
        'DALLAS': 'Dallas Cowboys',
        'NY GIANTS': 'New York Giants',
        'PHILADELPHIA': 'Philadelphia Eagles',
        'WASHINGTON': 'Washington Commanders',

        # NFC North
        'CHICAGO': 'Chicago Bears',
        'DETROIT': 'Detroit Lions',
        'GREEN BAY': 'Green Bay Packers',
        'MINNESOTA': 'Minnesota Vikings',

        # NFC South
        'ATLANTA': 'Atlanta Falcons',
        'CAROLINA': 'Carolina Panthers',
        'NEW ORLEANS': 'New Orleans Saints',
        'TAMPA BAY': 'Tampa Bay Buccaneers',
        'TAMPA': 'Tampa Bay Buccaneers',

        # NFC West
        'ARIZONA': 'Arizona Cardinals',
        'LA RAMS': 'Los Angeles Rams',
        'SAN FRANCISCO': 'San Francisco 49ers',
        'SEATTLE': 'Seattle Seahawks',
    }

    # ============================================================================
    # DATE PATTERNS
    # ============================================================================

    # Pattern 1: "Sunday, January 5, 2025"
    DATE_PATTERN_FULL = re.compile(
        r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+'
        r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+'
        r'(\d{1,2}),?\s+(\d{4})',
        re.IGNORECASE
    )

    # Pattern 2: "MM/DD/YYYY" or "M/D/YY"
    DATE_PATTERN_SLASH = re.compile(r'(\d{1,2})/(\d{1,2})/(\d{2,4})')

    # Pattern 3: "MM-DD-YYYY"
    DATE_PATTERN_DASH = re.compile(r'(\d{1,2})-(\d{1,2})-(\d{2,4})')

    # Pattern 4: "Thu 5:20 PM" - day abbreviation with time
    DATE_PATTERN_DAY_TIME = re.compile(
        r'(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*(AM|PM)',
        re.IGNORECASE
    )

    # Month name to number mapping
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
    }

    # ============================================================================
    # TIME PATTERNS
    # ============================================================================

    # Pattern 1: "12:30 PM" or "1:00 AM"
    TIME_PATTERN_12HR = re.compile(r'(\d{1,2}):(\d{2})\s*(AM|PM)', re.IGNORECASE)

    # Pattern 2: "14:30" (24-hour format)
    TIME_PATTERN_24HR = re.compile(r'(\d{1,2}):(\d{2})')

    # Pattern 3: "1 PM" (no minutes)
    TIME_PATTERN_HOUR_ONLY = re.compile(r'(\d{1,2})\s*(AM|PM)', re.IGNORECASE)

    # ============================================================================
    # SPREAD PATTERNS
    # ============================================================================

    # Pattern 1: Numeric spread (e.g., "+7.5", "-14", "3.5")
    SPREAD_PATTERN = re.compile(r'([+-]?\d+\.?\d*)')

    # Pattern 2: Pick'em variants
    PICKEM_PATTERN = re.compile(r'\b(pk|PK|pick|PICK|even|EVEN)\b', re.IGNORECASE)

    # ============================================================================
    # NORMALIZATION METHODS
    # ============================================================================

    @classmethod
    def strip_ranking(cls, text: str) -> str:
        """
        Remove ranking numbers from team names

        Examples:
            "#11 Alabama" -> "Alabama"
            "#24 James Madison" -> "James Madison"
            "11 Alabama" -> "Alabama"
        """
        return cls.RANKING_PATTERN.sub('', text).strip()

    @classmethod
    def strip_record(cls, text: str) -> str:
        """
        Remove win-loss records from team names

        Examples:
            "Dallas (7-10)" -> "Dallas"
            "Alabama (10-2)" -> "Alabama"
            "Iowa (6-3-1)" -> "Iowa"
        """
        text = cls.RECORD_PATTERN.sub(' ', text)
        text = cls.BRACKET_RECORD_PATTERN.sub(' ', text)
        return re.sub(r'\s+', ' ', text).strip()

    @classmethod
    def strip_point_value(cls, text: str) -> str:
        """
        Remove point value prefix from game lines

        Examples:
            "1 pt Dallas" -> "Dallas"
            "2 pt #11 Alabama" -> "#11 Alabama"
        """
        return cls.POINT_VALUE_PATTERN.sub('', text).strip()

    @classmethod
    def expand_abbreviations(cls, text: str) -> str:
        """
        Expand common team name abbreviations

        Examples:
            "Miss. State" -> "Mississippi State"
            "Fla. Atlantic" -> "Florida Atlantic"
            "No. Carolina" -> "Northern Carolina"
        """
        # Handle special case for LA (don't expand Louisiana for NFL teams)
        has_la = 'LA ' in text or text == 'LA'

        result = text
        for abbr, full in cls.ABBREVIATIONS.items():
            # Skip La. expansion if this looks like LA NFL team
            if abbr in ('La.', 'La') and has_la:
                continue

            # Handle abbreviations with and without periods
            # For "Miss." match "Miss." or "Miss" at word boundary
            abbr_escaped = re.escape(abbr)

            # Create pattern that matches the abbreviation followed by optional period
            # This handles both "Miss." and "Miss" cases
            if abbr.endswith('.'):
                # If abbreviation already has period, match it exactly
                pattern = re.compile(r'\b' + abbr_escaped + r'\s', re.IGNORECASE)
                result = pattern.sub(full + ' ', result)
            else:
                # For non-period abbreviations, use word boundary
                pattern = re.compile(r'\b' + abbr_escaped + r'\b', re.IGNORECASE)
                result = pattern.sub(full, result)

        # Clean up multiple spaces
        result = re.sub(r'\s+', ' ', result).strip()

        # Fix specific known issues
        if result == 'Louisiana CHARGERS':
            result = 'LA CHARGERS'
        if result == 'Louisiana RAMS':
            result = 'LA RAMS'
        if result == 'Northern CAROLINA State':
            result = 'North Carolina State'

        return result

    @classmethod
    def normalize_team_name(cls, name: str, league: Optional[str] = None) -> str:
        """
        Apply all normalization rules to a team name

        Steps:
        1. Strip point values
        2. Strip rankings
        3. Strip records
        4. Expand abbreviations
        5. Normalize case
        """
        normalized = name.strip()

        # Step 1: Strip point value
        normalized = cls.strip_point_value(normalized)

        # Step 2: Strip ranking
        normalized = cls.strip_ranking(normalized)

        # Step 3: Strip record
        normalized = cls.strip_record(normalized)

        # Step 4: Expand abbreviations
        normalized = cls.expand_abbreviations(normalized)

        # Step 5: Normalize case (title case for consistency)
        # Keep all caps for NFL teams that are standardized
        upper_normalized = normalized.upper()
        if league == 'NFL' and upper_normalized in cls.NFL_TEAMS:
            normalized = cls.NFL_TEAMS[upper_normalized]
        elif normalized.isupper():
            # Convert all caps to title case for readability
            normalized = normalized.title()

        return normalized.strip()

    @classmethod
    def parse_date(cls, text: str) -> Optional[str]:
        """
        Parse date from various formats and return ISO format (YYYY-MM-DD)

        Supported formats:
        - "Sunday, January 5, 2025"
        - "1/5/2025" or "01/05/25"
        - "1-5-2025"
        - Current year assumed if not provided
        """
        # Try full date format: "Sunday, January 5, 2025"
        match = cls.DATE_PATTERN_FULL.search(text)
        if match:
            _, month_name, day, year = match.groups()
            month = cls.MONTH_MAP[month_name.lower()]
            return f"{year}-{month:02d}-{int(day):02d}"

        # Try slash format: "1/5/2025"
        match = cls.DATE_PATTERN_SLASH.search(text)
        if match:
            month, day, year = match.groups()
            year = cls._normalize_year(year)
            return f"{year}-{int(month):02d}-{int(day):02d}"

        # Try dash format: "1-5-2025"
        match = cls.DATE_PATTERN_DASH.search(text)
        if match:
            month, day, year = match.groups()
            year = cls._normalize_year(year)
            return f"{year}-{int(month):02d}-{int(day):02d}"

        return None

    @classmethod
    def _normalize_year(cls, year_str: str) -> str:
        """Convert 2-digit year to 4-digit year"""
        year = int(year_str)
        if year < 100:
            year += 2000
        return str(year)

    @classmethod
    def parse_time(cls, text: str) -> Optional[str]:
        """
        Parse time from various formats and return 24-hour format (HH:MM)

        Supported formats:
        - "5:20 PM" -> "17:20"
        - "1:00 AM" -> "01:00"
        - "14:30" -> "14:30"
        - "1 PM" -> "13:00"
        """
        # Try 12-hour format with AM/PM
        match = cls.TIME_PATTERN_12HR.search(text)
        if match:
            hour, minute, meridiem = match.groups()
            hour = int(hour)
            minute = int(minute)

            # Convert to 24-hour
            if meridiem.upper() == 'PM' and hour != 12:
                hour += 12
            elif meridiem.upper() == 'AM' and hour == 12:
                hour = 0

            return f"{hour:02d}:{minute:02d}"

        # Try hour-only format
        match = cls.TIME_PATTERN_HOUR_ONLY.search(text)
        if match:
            hour, meridiem = match.groups()
            hour = int(hour)

            if meridiem.upper() == 'PM' and hour != 12:
                hour += 12
            elif meridiem.upper() == 'AM' and hour == 12:
                hour = 0

            return f"{hour:02d}:00"

        # Try 24-hour format
        match = cls.TIME_PATTERN_24HR.search(text)
        if match:
            hour, minute = match.groups()
            return f"{int(hour):02d}:{int(minute):02d}"

        return None

    @classmethod
    def parse_spread(cls, text: str) -> Optional[float]:
        """
        Parse spread value from text

        Examples:
            "+7.5" -> 7.5
            "-14" -> -14.0
            "PK" -> 0.0
            "3.5" -> 3.5
        """
        # Check for pick'em first
        if cls.PICKEM_PATTERN.search(text):
            return 0.0

        # Try numeric spread
        match = cls.SPREAD_PATTERN.search(text)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                return None

        return None

    @classmethod
    def validate_spreads(cls, home_spread: Optional[float], away_spread: Optional[float]) -> bool:
        """
        Validate that home and away spreads are exact opposites

        Returns:
            True if spreads are valid (sum to 0), False otherwise
        """
        if home_spread is None or away_spread is None:
            return False

        # Allow tiny floating point errors
        spread_sum = abs(home_spread + away_spread)
        return spread_sum < 0.01

    @classmethod
    def normalize_game_line(cls, line: str) -> NormalizedGame:
        """
        Parse and normalize a complete game line

        Example input:
        "1 pt  Dallas (7-10) +7.5  Thu 5:20 PM  PHILADELPHIA (18-3) -7.5"

        Returns:
            NormalizedGame object with all fields populated
        """
        game = NormalizedGame(raw_text=line)

        # Extract date and time
        game.event_date = cls.parse_date(line)
        game.event_time = cls.parse_time(line)

        # TODO: Implement full game line parsing
        # This is a placeholder - full implementation would:
        # 1. Split on separators (@ or vs)
        # 2. Extract team names
        # 3. Parse spreads
        # 4. Infer league

        return game


def main():
    """Example usage and testing"""
    normalizer = PicksheetNormalizer()

    print("=== Picksheet Normalizer Examples ===\n")

    # Example 1: Strip rankings
    print("1. Strip Rankings:")
    print(f"  '#11 Alabama' -> '{normalizer.strip_ranking('#11 Alabama')}'")
    print(f"  '#24 James Madison' -> '{normalizer.strip_ranking('#24 James Madison')}'")
    print()

    # Example 2: Strip records
    print("2. Strip Records:")
    print(f"  'Dallas (7-10)' -> '{normalizer.strip_record('Dallas (7-10)')}'")
    print(f"  'Iowa (6-3-1)' -> '{normalizer.strip_record('Iowa (6-3-1)')}'")
    print()

    # Example 3: Expand abbreviations
    print("3. Expand Abbreviations:")
    print(f"  'Miss. State' -> '{normalizer.expand_abbreviations('Miss. State')}'")
    print(f"  'Fla. Atlantic' -> '{normalizer.expand_abbreviations('Fla. Atlantic')}'")
    print()

    # Example 4: Parse dates
    print("4. Parse Dates:")
    print(f"  'Sunday, January 5, 2025' -> '{normalizer.parse_date('Sunday, January 5, 2025')}'")
    print(f"  '1/5/2025' -> '{normalizer.parse_date('1/5/2025')}'")
    print()

    # Example 5: Parse times
    print("5. Parse Times:")
    print(f"  '5:20 PM' -> '{normalizer.parse_time('5:20 PM')}'")
    print(f"  '1:00 AM' -> '{normalizer.parse_time('1:00 AM')}'")
    print()

    # Example 6: Parse spreads
    print("6. Parse Spreads:")
    print(f"  '+7.5' -> {normalizer.parse_spread('+7.5')}")
    print(f"  '-14' -> {normalizer.parse_spread('-14')}")
    print(f"  'PK' -> {normalizer.parse_spread('PK')}")
    print()

    # Example 7: Full normalization
    print("7. Full Team Name Normalization:")
    test_names = [
        "#11 Alabama (10-2)",
        "#24 James Madison (8-1)",
        "Miss. State (5-5)",
        "1 pt  Dallas (7-10)",
    ]
    for name in test_names:
        normalized = normalizer.normalize_team_name(name)
        print(f"  '{name}' -> '{normalized}'")


if __name__ == '__main__':
    main()
