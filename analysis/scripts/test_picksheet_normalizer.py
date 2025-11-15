#!/usr/bin/env python3
"""
Unit Tests for Picksheet Normalizer

Tests all normalization rules including:
- Ranking removal
- Record stripping
- Abbreviation expansion
- Date format standardization
- Time format conversion
- Spread parsing
"""

import pytest
from picksheet_normalizer import PicksheetNormalizer


class TestRankingRemoval:
    """Test ranking pattern removal"""

    def test_remove_hash_ranking(self):
        """Remove rankings with hash prefix"""
        assert PicksheetNormalizer.strip_ranking('#11 Alabama') == 'Alabama'
        assert PicksheetNormalizer.strip_ranking('#24 James Madison') == 'James Madison'
        assert PicksheetNormalizer.strip_ranking('#1 Georgia') == 'Georgia'

    def test_remove_number_ranking(self):
        """Remove rankings without hash prefix"""
        assert PicksheetNormalizer.strip_ranking('11 Alabama') == 'Alabama'
        assert PicksheetNormalizer.strip_ranking('1 Georgia') == 'Georgia'

    def test_no_ranking(self):
        """Preserve team names without rankings"""
        assert PicksheetNormalizer.strip_ranking('Alabama') == 'Alabama'
        assert PicksheetNormalizer.strip_ranking('Georgia') == 'Georgia'

    def test_ranking_with_multi_word_team(self):
        """Handle rankings with multi-word team names"""
        assert PicksheetNormalizer.strip_ranking('#11 Ohio State') == 'Ohio State'
        assert PicksheetNormalizer.strip_ranking('#24 Texas A&M') == 'Texas A&M'


class TestRecordStripping:
    """Test win-loss record removal"""

    def test_remove_standard_record(self):
        """Remove standard (W-L) records"""
        assert PicksheetNormalizer.strip_record('Dallas (7-10)') == 'Dallas'
        assert PicksheetNormalizer.strip_record('Alabama (10-2)') == 'Alabama'

    def test_remove_tie_record(self):
        """Remove (W-L-T) records with ties"""
        assert PicksheetNormalizer.strip_record('Iowa (6-3-1)') == 'Iowa'
        assert PicksheetNormalizer.strip_record('Detroit (6-3-1)') == 'Detroit'

    def test_remove_bracket_record(self):
        """Remove records in square brackets"""
        assert PicksheetNormalizer.strip_record('Alabama [10-2]') == 'Alabama'

    def test_multiple_records(self):
        """Handle team names with multiple records (unlikely but possible)"""
        result = PicksheetNormalizer.strip_record('Team (10-2) (5-1)')
        assert result == 'Team'

    def test_no_record(self):
        """Preserve team names without records"""
        assert PicksheetNormalizer.strip_record('Alabama') == 'Alabama'


class TestPointValueStripping:
    """Test point value prefix removal"""

    def test_remove_point_value(self):
        """Remove standard point value prefixes"""
        assert PicksheetNormalizer.strip_point_value('1 pt Dallas') == 'Dallas'
        assert PicksheetNormalizer.strip_point_value('2 pt Alabama') == 'Alabama'

    def test_remove_point_value_case_insensitive(self):
        """Handle different casings of 'pt'"""
        assert PicksheetNormalizer.strip_point_value('1 PT Dallas') == 'Dallas'
        assert PicksheetNormalizer.strip_point_value('1 Pt Dallas') == 'Dallas'

    def test_remove_point_value_with_extra_spaces(self):
        """Handle extra whitespace"""
        assert PicksheetNormalizer.strip_point_value('  1  pt   Dallas') == 'Dallas'

    def test_no_point_value(self):
        """Preserve text without point values"""
        assert PicksheetNormalizer.strip_point_value('Dallas') == 'Dallas'


class TestAbbreviationExpansion:
    """Test team name abbreviation expansion"""

    def test_expand_state_abbreviations(self):
        """Expand state name abbreviations"""
        assert PicksheetNormalizer.expand_abbreviations('Miss. State') == 'Mississippi State'
        assert PicksheetNormalizer.expand_abbreviations('Fla. Atlantic') == 'Florida Atlantic'
        assert PicksheetNormalizer.expand_abbreviations('Mich. State') == 'Michigan State'

    def test_expand_directional_abbreviations(self):
        """Expand directional abbreviations"""
        assert PicksheetNormalizer.expand_abbreviations('No. Carolina') == 'Northern Carolina'
        assert PicksheetNormalizer.expand_abbreviations('So. California') == 'Southern California'
        assert PicksheetNormalizer.expand_abbreviations('E. Michigan') == 'Eastern Michigan'
        assert PicksheetNormalizer.expand_abbreviations('W. Virginia') == 'Western Virginia'

    def test_expand_case_insensitive(self):
        """Expansion should be case insensitive"""
        # Expansion preserves case of non-replaced parts
        # Replacement text uses standard capitalization from ABBREVIATIONS dict
        assert PicksheetNormalizer.expand_abbreviations('MISS. STATE') == 'Mississippi STATE'
        assert PicksheetNormalizer.expand_abbreviations('miss. state') == 'Mississippi state'

    def test_preserve_la_for_nfl(self):
        """Don't expand LA to Louisiana for NFL teams"""
        assert 'LA' in PicksheetNormalizer.expand_abbreviations('LA CHARGERS')
        assert 'LA' in PicksheetNormalizer.expand_abbreviations('LA RAMS')

    def test_no_abbreviations(self):
        """Preserve team names without abbreviations"""
        assert PicksheetNormalizer.expand_abbreviations('Alabama') == 'Alabama'
        assert PicksheetNormalizer.expand_abbreviations('Georgia') == 'Georgia'


class TestDateParsing:
    """Test date format standardization"""

    def test_parse_full_date(self):
        """Parse full date format: Day, Month DD, YYYY"""
        assert PicksheetNormalizer.parse_date('Sunday, January 5, 2025') == '2025-01-05'
        assert PicksheetNormalizer.parse_date('Thursday, November 15, 2025') == '2025-11-15'
        assert PicksheetNormalizer.parse_date('Monday, December 1, 2025') == '2025-12-01'

    def test_parse_slash_date(self):
        """Parse slash format: MM/DD/YYYY"""
        assert PicksheetNormalizer.parse_date('1/5/2025') == '2025-01-05'
        assert PicksheetNormalizer.parse_date('11/15/2025') == '2025-11-15'
        assert PicksheetNormalizer.parse_date('12/31/2025') == '2025-12-31'

    def test_parse_slash_date_two_digit_year(self):
        """Parse slash format with 2-digit year"""
        assert PicksheetNormalizer.parse_date('1/5/25') == '2025-01-05'
        assert PicksheetNormalizer.parse_date('12/31/25') == '2025-12-31'

    def test_parse_dash_date(self):
        """Parse dash format: MM-DD-YYYY"""
        assert PicksheetNormalizer.parse_date('1-5-2025') == '2025-01-05'
        assert PicksheetNormalizer.parse_date('11-15-2025') == '2025-11-15'

    def test_parse_invalid_date(self):
        """Return None for unparseable dates"""
        assert PicksheetNormalizer.parse_date('invalid date') is None
        assert PicksheetNormalizer.parse_date('') is None

    def test_parse_date_case_insensitive(self):
        """Date parsing should be case insensitive"""
        assert PicksheetNormalizer.parse_date('SUNDAY, JANUARY 5, 2025') == '2025-01-05'
        assert PicksheetNormalizer.parse_date('sunday, january 5, 2025') == '2025-01-05'


class TestTimeParsing:
    """Test time format conversion to 24-hour format"""

    def test_parse_12hour_pm(self):
        """Parse 12-hour PM times"""
        assert PicksheetNormalizer.parse_time('5:20 PM') == '17:20'
        assert PicksheetNormalizer.parse_time('1:00 PM') == '13:00'
        assert PicksheetNormalizer.parse_time('12:30 PM') == '12:30'

    def test_parse_12hour_am(self):
        """Parse 12-hour AM times"""
        assert PicksheetNormalizer.parse_time('1:00 AM') == '01:00'
        assert PicksheetNormalizer.parse_time('9:45 AM') == '09:45'
        assert PicksheetNormalizer.parse_time('12:00 AM') == '00:00'

    def test_parse_hour_only(self):
        """Parse hour-only format"""
        assert PicksheetNormalizer.parse_time('1 PM') == '13:00'
        assert PicksheetNormalizer.parse_time('5 AM') == '05:00'

    def test_parse_24hour(self):
        """Parse 24-hour format (pass through)"""
        assert PicksheetNormalizer.parse_time('14:30') == '14:30'
        assert PicksheetNormalizer.parse_time('09:15') == '09:15'

    def test_parse_case_insensitive(self):
        """Time parsing should be case insensitive"""
        assert PicksheetNormalizer.parse_time('5:20 pm') == '17:20'
        assert PicksheetNormalizer.parse_time('5:20 PM') == '17:20'

    def test_parse_invalid_time(self):
        """Return None for unparseable times"""
        assert PicksheetNormalizer.parse_time('invalid') is None
        assert PicksheetNormalizer.parse_time('') is None


class TestSpreadParsing:
    """Test spread value parsing"""

    def test_parse_positive_spread(self):
        """Parse positive spreads"""
        assert PicksheetNormalizer.parse_spread('+7.5') == 7.5
        assert PicksheetNormalizer.parse_spread('+14') == 14.0
        assert PicksheetNormalizer.parse_spread('+3.5') == 3.5

    def test_parse_negative_spread(self):
        """Parse negative spreads"""
        assert PicksheetNormalizer.parse_spread('-7.5') == -7.5
        assert PicksheetNormalizer.parse_spread('-14') == -14.0
        assert PicksheetNormalizer.parse_spread('-3.5') == -3.5

    def test_parse_unsigned_spread(self):
        """Parse spreads without sign"""
        assert PicksheetNormalizer.parse_spread('7.5') == 7.5
        assert PicksheetNormalizer.parse_spread('14') == 14.0

    def test_parse_pickem(self):
        """Parse pick'em variants as 0.0"""
        assert PicksheetNormalizer.parse_spread('PK') == 0.0
        assert PicksheetNormalizer.parse_spread('pk') == 0.0
        assert PicksheetNormalizer.parse_spread('PICK') == 0.0
        assert PicksheetNormalizer.parse_spread('even') == 0.0

    def test_parse_invalid_spread(self):
        """Return None for unparseable spreads"""
        assert PicksheetNormalizer.parse_spread('invalid') is None
        assert PicksheetNormalizer.parse_spread('') is None


class TestSpreadValidation:
    """Test spread validation logic"""

    def test_validate_opposite_spreads(self):
        """Spreads should be exact opposites"""
        assert PicksheetNormalizer.validate_spreads(7.5, -7.5) is True
        assert PicksheetNormalizer.validate_spreads(-14.0, 14.0) is True
        assert PicksheetNormalizer.validate_spreads(0.0, 0.0) is True

    def test_validate_mismatched_spreads(self):
        """Mismatched spreads should fail validation"""
        assert PicksheetNormalizer.validate_spreads(7.5, -7.0) is False
        assert PicksheetNormalizer.validate_spreads(14.0, 14.0) is False

    def test_validate_none_spreads(self):
        """None spreads should fail validation"""
        assert PicksheetNormalizer.validate_spreads(None, -7.5) is False
        assert PicksheetNormalizer.validate_spreads(7.5, None) is False
        assert PicksheetNormalizer.validate_spreads(None, None) is False


class TestFullNormalization:
    """Test complete team name normalization pipeline"""

    def test_normalize_ncaaf_team(self):
        """Normalize NCAAF team with ranking and record"""
        result = PicksheetNormalizer.normalize_team_name('#11 Alabama (10-2)')
        assert result == 'Alabama'

    def test_normalize_with_abbreviation(self):
        """Normalize team with abbreviation"""
        result = PicksheetNormalizer.normalize_team_name('#24 Miss. State (8-1)')
        assert result == 'Mississippi State'

    def test_normalize_nfl_team(self):
        """Normalize NFL team (preserve standard name)"""
        result = PicksheetNormalizer.normalize_team_name('Dallas (7-10)', league='NFL')
        assert result == 'Dallas Cowboys'

    def test_normalize_with_point_value(self):
        """Normalize team with point value prefix"""
        result = PicksheetNormalizer.normalize_team_name('1 pt  #11 Alabama (10-2)')
        assert result == 'Alabama'

    def test_normalize_caps_team(self):
        """Normalize all-caps team names"""
        result = PicksheetNormalizer.normalize_team_name('PHILADELPHIA (18-3)', league='NFL')
        assert result == 'Philadelphia Eagles'

    def test_normalize_clean_team(self):
        """Teams without special formatting should normalize to title case"""
        result = PicksheetNormalizer.normalize_team_name('Alabama')
        assert result == 'Alabama'

    def test_complex_normalization(self):
        """Test complex normalization with multiple patterns"""
        cases = [
            ('1 pt  #11 Alabama (10-2)', 'Alabama'),
            ('2 pt  #24 James Madison (8-1)', 'James Madison'),
            ('1 pt  Miss. State (5-5)', 'Mississippi State'),
            ('#5 No. Carolina (7-3)', 'Northern Carolina'),
        ]
        for input_name, expected in cases:
            result = PicksheetNormalizer.normalize_team_name(input_name)
            assert result == expected, f"Failed for {input_name}: got {result}, expected {expected}"


class TestRealWorldExamples:
    """Test with actual picksheet examples from week-01.txt, week-05.txt, week-10.txt"""

    def test_week01_game_line(self):
        """Parse actual game from week-01.txt"""
        # "1 pt  Dallas (3-5-1) +7.5  Thu 5:20 PM  PHILADELPHIA (7-2) -7.5"
        away_team = '1 pt  Dallas (3-5-1)'
        home_team = 'PHILADELPHIA (7-2)'

        away_normalized = PicksheetNormalizer.normalize_team_name(away_team, 'NFL')
        home_normalized = PicksheetNormalizer.normalize_team_name(home_team, 'NFL')

        assert away_normalized == 'Dallas Cowboys'
        assert home_normalized == 'Philadelphia Eagles'

    def test_week05_abbreviation(self):
        """Parse team with state abbreviation"""
        team = '1 pt  San Jose St. (3-6) +36.5'
        normalized = PicksheetNormalizer.normalize_team_name(team)
        assert 'State' in normalized

    def test_week10_ranked_team(self):
        """Parse ranked NCAAF team"""
        # Note: normalize_team_name doesn't strip spread values, only team name elements
        team = '#12 BYU (8-1)'
        normalized = PicksheetNormalizer.normalize_team_name(team)
        assert normalized == 'Byu'
        assert '#' not in normalized
        assert '(' not in normalized


if __name__ == '__main__':
    # Run tests with pytest
    pytest.main([__file__, '-v', '--tb=short'])
