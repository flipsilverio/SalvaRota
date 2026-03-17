/**
 * safetyScoring.ts
 *
 * Client-side safety scoring for SalvaRota.
 * Combines time-of-day, daylight, open businesses, and crime data
 * into per-segment and overall route scores.
 *
 * All scoring is intentionally simple and explainable so users
 * can understand why a route was chosen over another.
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Rio de Janeiro — used for sunrise/sunset calculation */
const RIO_LAT        = -22.9068;
const RIO_LNG        = -43.1729;
const RIO_UTC_OFFSET = -3; // BRT (UTC-3)

// ── Time Safety Score (Feature 8) ─────────────────────────────────────────────

/**
 * Returns a safety score 0–100 based on the hour of day in Rio.
 *
 * Buckets are derived from ISP Rio crime data:
 *   06:00–09:00 → 85  (commuter hours, lower target density)
 *   09:00–17:00 → 90  (business hours, max foot traffic)
 *   17:00–20:00 → 80  (late afternoon, robbery begins to rise)
 *   20:00–23:00 → 65  (evening peak)
 *   23:00–02:00 → 50  (late night / bar closing)
 *   02:00–06:00 → 40  (deep night, very few people)
 */
export function timeSafetyScore(date: Date = new Date()): number {
  const h = date.getHours();
  if (h >= 6  && h < 9)  return 85;
  if (h >= 9  && h < 17) return 90;
  if (h >= 17 && h < 20) return 80;
  if (h >= 20 && h < 23) return 65;
  if (h >= 23 || h < 2)  return 50;
  return 40; // 02:00–05:59
}

// ── Sunrise / Sunset (Feature 7) ──────────────────────────────────────────────

/**
 * Compute sunrise and sunset for Rio de Janeiro using the NOAA algorithm.
 * Returns minutes from local midnight (BRT).
 *
 * Accurate to ±2 min for latitudes between -60° and +60°.
 */
function getSunriseSunsetMinutes(date: Date): { sunrise: number; sunset: number } {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();

  // Julian date
  const JD =
    367 * year
    - Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4)
    + Math.floor(275 * month / 9)
    + day + 1721013.5;

  const T = (JD - 2451545.0) / 36525; // Julian centuries from J2000.0

  // Geometric mean longitude of the Sun (°)
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;

  // Mean anomaly of the Sun (°)
  const M    = 357.52911 + T * (35999.05029 - T * 0.0001537);
  const Mrad = M * (Math.PI / 180);

  // Equation of center
  const C =
    (1.914602 - T * (0.004817 + T * 0.000014)) * Math.sin(Mrad)
    + (0.019993 - T * 0.000101) * Math.sin(2 * Mrad)
    + 0.000289 * Math.sin(3 * Mrad);

  // Sun's true longitude (°)
  const sunLon = L0 + C;

  // Apparent longitude — correct for aberration & nutation
  const omega  = 125.04 - 1934.136 * T;
  const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(omega * (Math.PI / 180));
  const lambdaRad = lambda * (Math.PI / 180);

  // Obliquity of ecliptic (°)
  const eps0 =
    23
    + 26 / 60
    + 21.448 / 3600
    - T * (46.815 / 3600 + T * (0.00059 / 3600 - T * 0.001813 / 3600));
  const eps = (eps0 + 0.00256 * Math.cos(omega * (Math.PI / 180))) * (Math.PI / 180);

  // Solar declination (rad)
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambdaRad));

  // Equation of time (minutes)
  const y = Math.tan(eps / 2) ** 2;
  const L0rad = L0 * (Math.PI / 180);
  const eqTime =
    4 * (180 / Math.PI) * (
      y * Math.sin(2 * L0rad)
      - 2 * 0.016708634 * Math.sin(Mrad)
      + 4 * 0.016708634 * y * Math.sin(Mrad) * Math.cos(2 * L0rad)
      - 0.5 * y * y * Math.sin(4 * L0rad)
      - 1.25 * 0.016708634 * 0.016708634 * Math.sin(2 * Mrad)
    );

  // Hour angle at horizon (accounting for atmospheric refraction at −0.833°)
  const latRad = RIO_LAT * (Math.PI / 180);
  const cosHA  =
    (Math.cos(90.833 * Math.PI / 180) - Math.sin(latRad) * Math.sin(decl))
    / (Math.cos(latRad) * Math.cos(decl));

  // Polar night / polar day guard
  if (cosHA > 1)  return { sunrise: 720, sunset: 720 };
  if (cosHA < -1) return { sunrise: 0, sunset: 1440 };

  const HA = Math.acos(cosHA) * (180 / Math.PI);

  // Solar noon in minutes from UTC midnight
  const solarNoonUTC = 720 - eqTime - RIO_LNG * 4;

  // Convert to local BRT (UTC-3)
  const sunrise = Math.round(solarNoonUTC - HA * 4 + RIO_UTC_OFFSET * 60);
  const sunset  = Math.round(solarNoonUTC + HA * 4 + RIO_UTC_OFFSET * 60);

  return { sunrise, sunset };
}

/**
 * Returns 100 during Rio daylight hours, nightScore otherwise.
 *
 * @param date       Defaults to now
 * @param nightScore Score to use when it's dark (typically the backend lighting score)
 */
export function daylightScore(date: Date = new Date(), nightScore: number = 40): number {
  const { sunrise, sunset } = getSunriseSunsetMinutes(date);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= sunrise && minutes < sunset ? 100 : nightScore;
}

// ── Segment Scoring (Feature 12) ──────────────────────────────────────────────

export interface SegmentInput {
  lightingScore:  number | null; // 0–100 from backend, or null if unknown
  openBusinesses: number | null; // count of open businesses nearby
  crimeIncidents: number;        // incidents in last 90 days
  date?:          Date;          // defaults to now
}

/**
 * Score a single route segment combining all available signals.
 *
 * Formula:
 *   segmentScore = (lightScore + timeScore + businessScore) / 3 − dangerPenalty
 *   clamped to [0, 100]
 *
 * Light score:    100 during daylight; blended with backend lighting at night.
 * Time score:     From timeSafetyScore() bucket.
 * Business score: Open businesses reduce crime risk (Feature 10 penalty included).
 * Danger penalty: High crime incidents subtract points (Feature 11).
 */
export function computeSegmentScore(params: SegmentInput): number {
  const date = params.date ?? new Date();

  // Light: if daytime → 100; if night → blend backend score with darkness penalty
  const lightScore =
    params.lightingScore !== null
      ? (daylightScore(date) + params.lightingScore) / 2
      : daylightScore(date);

  // Time bucket score
  const timeScore = timeSafetyScore(date);

  // Business score (Feature 10 — penalise no-business areas)
  const biz = params.openBusinesses ?? 0;
  let businessScore: number;
  if (biz === 0) businessScore = 40;       // no businesses → −10 to −20 effective
  else if (biz === 1) businessScore = 60;
  else if (biz === 2) businessScore = 80;
  else businessScore = 100;               // 3+ businesses

  // Crime danger penalty (Feature 11)
  const crime = params.crimeIncidents;
  let dangerPenalty: number;
  if (crime > 10) dangerPenalty = 20;
  else if (crime > 5) dangerPenalty = 15;
  else if (crime > 2) dangerPenalty = 8;
  else dangerPenalty = 0;

  const raw = (lightScore + timeScore + businessScore) / 3 - dangerPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Average segment scores into an overall route score.
 * Applies an additional 15% penalty if any segment scores below 40 (Feature 11).
 */
export function computeRouteScore(segmentScores: number[]): number {
  if (!segmentScores.length) return 0;

  const avg = segmentScores.reduce((a, b) => a + b, 0) / segmentScores.length;

  // Feature 11: dangerous route penalty
  const hasDangerousSegment = segmentScores.some(s => s < 40);
  const penalised = hasDangerousSegment ? avg * 0.85 : avg;

  return Math.max(0, Math.min(100, Math.round(penalised)));
}

// ── Color mapping (Feature 9) ─────────────────────────────────────────────────

/**
 * Maps a safety score to a route line colour.
 *   90–100 → green
 *   75–89  → yellow
 *   60–74  → orange
 *   0–59   → red
 */
export function scoreToColor(score: number): string {
  if (score >= 90) return '#5BAD6F'; // green
  if (score >= 75) return '#E8A838'; // yellow
  if (score >= 60) return '#F5A623'; // orange
  return '#E05252';                  // red
}

/** Human-readable label for a safety score */
export function scoreLabel(score: number): string {
  if (score >= 75) return 'Seguro';
  if (score >= 40) return 'Moderado';
  return 'Perigoso';
}

// ── Utility: split coordinates into N equal-length segments ──────────────────

/**
 * Divide a polyline into N roughly equal sub-arrays (by coordinate count).
 * Used to map backend segments onto Google Directions geometry.
 */
export function splitCoordinates(
  coords: [number, number][],
  n: number,
): [number, number][][] {
  if (n <= 1 || coords.length < 2) return [coords];

  const result: [number, number][][] = [];
  const totalPoints = coords.length - 1; // number of edges

  for (let i = 0; i < n; i++) {
    const startIdx = Math.floor((i * totalPoints) / n);
    const endIdx   = Math.floor(((i + 1) * totalPoints) / n);
    // Ensure adjacent segments share their boundary point for visual continuity
    result.push(coords.slice(startIdx, endIdx + 1));
  }

  return result;
}

// ── Alternative route selection (Feature 14) ─────────────────────────────────

export interface ScoredRoute<T> {
  route:       T;
  clientScore: number; // time + daylight combined score
}

/**
 * Score a set of routes using only client-side signals (time + daylight).
 * Used when backend data is unavailable or to break ties.
 *
 * Returns routes sorted safest-first.
 */
export function rankRoutesByClientScore<T>(routes: T[], date: Date = new Date()): ScoredRoute<T>[] {
  // Client score is the same for all routes (purely time/daylight-based),
  // so this preserves Google's ordering while tagging each with a score.
  const tScore = timeSafetyScore(date);
  const dScore = daylightScore(date);
  const clientScore = Math.round((tScore + dScore) / 2);

  return routes.map(route => ({ route, clientScore }));
}
