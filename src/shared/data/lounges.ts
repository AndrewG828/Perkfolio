import type { Airport, Lounge, LoungeNetwork } from "./types";

/**
 * Lounge finder dataset. Researched November 2026.
 * Openings and closures change often, so check the operator's site or app before you travel.
 * Lounges that are announced but not yet open (e.g. Centurion EWR/BOS, Capital One CLT,
 * Chase Sapphire LAX/SEA, Delta Sky Club LAS) are intentionally left out.
 */

const PP_NOTE = "Also accessible via Priority Pass";

function lounge(
  id: string,
  name: string,
  network: LoungeNetwork,
  airportCode: string,
  terminal: string,
  location?: string,
  notes?: string,
): Lounge {
  const l: Lounge = { id, name, network, airportCode, terminal };
  if (location) l.location = location;
  if (notes) l.notes = notes;
  return l;
}

/** A lounge that's closed for now (see `Lounge.closed`). */
const closedLounge = (l: Lounge, closed: NonNullable<Lounge["closed"]>): Lounge => ({ ...l, closed });

export const airports: Airport[] = [
  // United States
  { code: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", country: "United States" },
  { code: "AUS", name: "Austin-Bergstrom International Airport", city: "Austin", country: "United States" },
  { code: "ANC", name: "Ted Stevens Anchorage International Airport", city: "Anchorage", country: "United States" },
  { code: "BDL", name: "Bradley International Airport", city: "Hartford", country: "United States" },
  { code: "BOS", name: "Boston Logan International Airport", city: "Boston", country: "United States" },
  { code: "BWI", name: "Baltimore/Washington International Thurgood Marshall Airport", city: "Baltimore", country: "United States" },
  { code: "CLT", name: "Charlotte Douglas International Airport", city: "Charlotte", country: "United States" },
  { code: "CVG", name: "Cincinnati/Northern Kentucky International Airport", city: "Cincinnati", country: "United States" },
  { code: "DCA", name: "Ronald Reagan Washington National Airport", city: "Washington, D.C.", country: "United States" },
  { code: "DEN", name: "Denver International Airport", city: "Denver", country: "United States" },
  { code: "DFW", name: "Dallas Fort Worth International Airport", city: "Dallas-Fort Worth", country: "United States" },
  { code: "DTW", name: "Detroit Metropolitan Wayne County Airport", city: "Detroit", country: "United States" },
  { code: "EWR", name: "Newark Liberty International Airport", city: "Newark", country: "United States" },
  { code: "HNL", name: "Daniel K. Inouye International Airport", city: "Honolulu", country: "United States" },
  { code: "IAD", name: "Washington Dulles International Airport", city: "Washington, D.C.", country: "United States" },
  { code: "IAH", name: "George Bush Intercontinental Airport", city: "Houston", country: "United States" },
  { code: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "United States" },
  { code: "LAS", name: "Harry Reid International Airport", city: "Las Vegas", country: "United States" },
  { code: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "United States" },
  { code: "LGA", name: "LaGuardia Airport", city: "New York", country: "United States" },
  { code: "MCO", name: "Orlando International Airport", city: "Orlando", country: "United States" },
  { code: "MIA", name: "Miami International Airport", city: "Miami", country: "United States" },
  { code: "MSP", name: "Minneapolis-Saint Paul International Airport", city: "Minneapolis", country: "United States" },
  { code: "ORD", name: "O'Hare International Airport", city: "Chicago", country: "United States" },
  { code: "PDX", name: "Portland International Airport", city: "Portland", country: "United States" },
  { code: "PHL", name: "Philadelphia International Airport", city: "Philadelphia", country: "United States" },
  { code: "PHX", name: "Phoenix Sky Harbor International Airport", city: "Phoenix", country: "United States" },
  { code: "SAN", name: "San Diego International Airport", city: "San Diego", country: "United States" },
  { code: "SEA", name: "Seattle-Tacoma International Airport", city: "Seattle", country: "United States" },
  { code: "SFO", name: "San Francisco International Airport", city: "San Francisco", country: "United States" },
  { code: "SJC", name: "San José Mineta International Airport", city: "San Jose", country: "United States" },
  { code: "SLC", name: "Salt Lake City International Airport", city: "Salt Lake City", country: "United States" },
  { code: "SMF", name: "Sacramento International Airport", city: "Sacramento", country: "United States" },
  // Canada & Latin America
  { code: "YYZ", name: "Toronto Pearson International Airport", city: "Toronto", country: "Canada" },
  { code: "CUN", name: "Cancún International Airport", city: "Cancún", country: "Mexico" },
  { code: "MEX", name: "Mexico City International Airport", city: "Mexico City", country: "Mexico" },
  { code: "MTY", name: "Monterrey International Airport", city: "Monterrey", country: "Mexico" },
  { code: "EZE", name: "Ministro Pistarini International Airport (Ezeiza)", city: "Buenos Aires", country: "Argentina" },
  // Europe & Middle East
  { code: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom" },
  { code: "CDG", name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France" },
  { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany" },
  { code: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands" },
  { code: "ARN", name: "Stockholm Arlanda Airport", city: "Stockholm", country: "Sweden" },
  { code: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates" },
  // Asia-Pacific
  { code: "DEL", name: "Indira Gandhi International Airport", city: "New Delhi", country: "India" },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", country: "India" },
  { code: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong SAR" },
  { code: "HND", name: "Tokyo Haneda Airport", city: "Tokyo", country: "Japan" },
  { code: "NRT", name: "Narita International Airport", city: "Tokyo", country: "Japan" },
  { code: "SIN", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore" },
  { code: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia" },
  { code: "MEL", name: "Melbourne Airport", city: "Melbourne", country: "Australia" },
];

export const lounges: Lounge[] = [
  // ---------------------------------------------------------------------------
  // American Express Centurion Lounges (US)
  // ---------------------------------------------------------------------------
  lounge("centurion-atl-e", "The Centurion Lounge", "centurion", "ATL", "Concourse E", "Near gate E11", "Largest Centurion Lounge (opened Feb 2024); outdoor terraces"),
  lounge("centurion-clt", "The Centurion Lounge", "centurion", "CLT", "Concourses D/E", "Mezzanine level between Concourses D and E, after security", "A Sidecar by The Centurion Lounge is planned for Concourse A in 2027"),
  lounge("centurion-dca-t2", "The Centurion Lounge", "centurion", "DCA", "Terminal 2", "Past the South Security Checkpoint", "Opened July 2024"),
  lounge("centurion-dfw-d", "The Centurion Lounge", "centurion", "DFW", "Terminal D", "Near gate D12", "Expanding by nearly 50% (new dining area, second bar, walk-up ice-cream window); expanded lounge expected in 2027. No closure announced"),
  lounge("centurion-den-c", "The Centurion Lounge", "centurion", "DEN", "Concourse C", "Between gates C46 and C48; take the escalators up to the mezzanine-level entrance"),
  lounge("centurion-iah-d", "The Centurion Lounge", "centurion", "IAH", "Terminal D", "Near gate D12, after security; take the elevator inside the Duty Free shop down to the lounge entrance", "Expansion under construction (expected to be fully updated by 2028): reduced seating and longer waits; may close for short periods"),
  lounge("centurion-las-d", "The Centurion Lounge", "centurion", "LAS", "Concourse D", "Across from gate D1"),
  lounge("centurion-sidecar-las-d", "Sidecar by The Centurion Lounge", "centurion", "LAS", "Concourse D", "Near gate D1, a short walk from The Centurion Lounge", "Opened March 2026; shorter-stay, dining-first concept"),
  lounge("centurion-lax-tbit", "The Centurion Lounge", "centurion", "LAX", "Tom Bradley International Terminal", "Near gate 148: right after TBIT security, first left before the bridge to the Great Hall; Amex elevator from Level 4 down to Level 2"),
  lounge("centurion-mia-d", "The Centurion Lounge", "centurion", "MIA", "Concourse D", "Near gate D12, 4th floor"),
  lounge("centurion-jfk-t4", "The Centurion Lounge", "centurion", "JFK", "Terminal 4", "After security"),
  lounge("centurion-lga-b", "The Centurion Lounge", "centurion", "LGA", "Terminal B", "After security, on Level 4 near the entrance to the Eastern Concourse pedestrian bridge; next to the Chase Sapphire Lounge"),
  closedLounge(
    lounge("centurion-phl-a", "The Centurion Lounge", "centurion", "PHL", "Terminal A-West", "Near gate A14", "Temporarily closed from Oct 16, 2026 for expansion to ~12,000 sq ft; reopening expected by end of 2027"),
    { from: "2026-10-16", until: "2028-01-01", untilLabel: "end of 2027 (expected)" },
  ),
  lounge("centurion-phx-t4", "The Centurion Lounge", "centurion", "PHX", "Terminal 4", "Across from gate B22, level 3"),
  lounge("centurion-slc-b", "The Centurion Lounge", "centurion", "SLC", "Concourse B", "East wing, near gate B31 (2nd floor)", "Opened Oct 28, 2025; ~18,000 sq ft"),
  lounge("centurion-sea-b", "The Centurion Lounge", "centurion", "SEA", "Concourse B", "Mezzanine above the Central Terminal food court, near gate B3 (facing the food court windows, turn left and follow signs for the elevator)", "Expanded in 2024"),
  lounge("centurion-sfo-t2-temp", "The Centurion Lounge (Temporary Location)", "centurion", "SFO", "Terminal 2, Concourse D", "Right after the Terminal 2 security checkpoint, near Compass Books and Napa Farms Market", "Temporary Terminal 2 space while the Terminal 3 lounge is closed for the T3 West modernization; offerings may be limited. Permanent T3 lounge expected to reopen in 2027"),

  // ---------------------------------------------------------------------------
  // American Express Centurion Lounges (International)
  // ---------------------------------------------------------------------------
  lounge("centurion-lhr-t3", "The Centurion Lounge", "centurion", "LHR", "Terminal 3", "Level 2, Area A: after security, follow the Level 1 signs for Flight Connection Area A, then take the lift in the main shopping and dining area", "A second London Centurion Lounge is planned for Terminal 5 (2028)"),
  lounge("centurion-ams", "The Centurion Lounge", "centurion", "AMS", "Main terminal", "Between Piers E and F", "Opened Sept 17, 2026; first Centurion Lounge in continental Europe; no showers. Check Schengen/non-Schengen access rules"),
  lounge("centurion-hkg-t1", "The Centurion Lounge", "centurion", "HKG", "Terminal 1", "Airside"),
  lounge("centurion-hnd-t3", "The Centurion Lounge", "centurion", "HND", "Terminal 3", "4th floor, near gate 114", "Opened July 2025; first Centurion Lounge in Japan"),
  lounge("centurion-del-t1", "The Centurion Lounge", "centurion", "DEL", "Terminal 1", "Level 4, near gate 2 (security hold area)", "Opened March 30, 2026; open 24 hours; replaced the former Terminal 3 lounge"),
  closedLounge(
    lounge("centurion-bom-t2", "The Centurion Lounge", "centurion", "BOM", "Terminal 2", "Domestic departures area", "Amex's lounge finder lists it as temporarily closed, with no reopening date"),
    {},
  ),
  lounge("centurion-syd-t1", "The Centurion Lounge", "centurion", "SYD", "Terminal 1 (International)", "After security"),
  lounge("centurion-mel-t2", "The Centurion Lounge", "centurion", "MEL", "Terminal 2 (International)", "After security"),
  lounge("centurion-eze-a", "The Centurion Lounge", "centurion", "EZE", "Terminal A"),
  lounge("centurion-mex-t1-domestic", "The Centurion Lounge", "centurion", "MEX", "Terminal 1", "Domestic departures"),
  lounge("centurion-mex-t1-international", "The Centurion Lounge", "centurion", "MEX", "Terminal 1", "International departures"),
  lounge("centurion-mex-t2", "The Centurion Lounge", "centurion", "MEX", "Terminal 2"),
  lounge("centurion-mty-a", "The Centurion Lounge", "centurion", "MTY", "Terminal A", "Near gate 4"),
  lounge("centurion-mty-b", "The Centurion Lounge", "centurion", "MTY", "Terminal B", "Near the food court"),

  // Other American Express lounges outside the US
  lounge("amex-arn-t5", "American Express Lounge by Pontus Frithiof", "amex-international", "ARN", "Terminal 5", "Marketplace, between piers E and F", "Separate Centurion and Platinum rooms; reopened April 2024 after doubling in size"),

  // ---------------------------------------------------------------------------
  // Capital One Lounges & Landings
  // ---------------------------------------------------------------------------
  lounge("capital-one-dfw-d", "Capital One Lounge", "capital-one", "DFW", "Terminal D", "Near gate D22", "First Capital One Lounge (opened Nov 2021)"),
  lounge("capital-one-den-a", "Capital One Lounge", "capital-one", "DEN", "Concourse A", "Mezzanine level, near gate A34"),
  lounge("capital-one-iad", "Capital One Lounge", "capital-one", "IAD", "Main Terminal", "Past the TSA PreCheck/CLEAR checkpoints; reachable from the Z gates", "Not near the gates; allow time to reach your concourse"),
  lounge("capital-one-las-d", "Capital One Lounge", "capital-one", "LAS", "Terminal 1, Concourse D", "Concourse D atrium, 2nd level, near gate D50"),
  lounge("capital-one-jfk-t4", "Capital One Lounge", "capital-one", "JFK", "Terminal 4", "Retail hall, level 3", "Flagship location; opened June 19, 2025; open 24 hours"),
  lounge("capital-one-landing-dca-t2", "Capital One Landing", "capital-one", "DCA", "Terminal 2", "Post-security, center of Terminal 2", "First Capital One Landing (opened Nov 2024); dining-focused concept with José Andrés Group"),
  lounge("capital-one-landing-lga-b", "Capital One Landing", "capital-one", "LGA", "Terminal B", "On a Terminal B skybridge", "Opened Feb 18, 2026; 12,500 sq ft flagship Landing with José Andrés Group. A Capital One Lounge at CLT is announced but not yet open"),

  // ---------------------------------------------------------------------------
  // Chase Sapphire Lounges by The Club
  // (Chase Sapphire Lounges left Priority Pass/LoungeKey on Aug 15, 2026)
  // ---------------------------------------------------------------------------
  lounge("chase-sapphire-bos", "Chase Sapphire Lounge by The Club", "chase-sapphire", "BOS", "Terminals B/C", "Post-security, on the B–C connector"),
  lounge("chase-sapphire-dfw-d", "Chase Sapphire Lounge by The Club", "chase-sapphire", "DFW", "Terminal D", "Near gate D25", "Opened July 16, 2026; 18,000 sq ft with a whiskey lounge"),
  lounge("chase-sapphire-jfk-t4", "Chase Sapphire Lounge by The Club with Etihad Airways", "chase-sapphire", "JFK", "Terminal 4", undefined, "Operated with Etihad. Late-2026 reports say it is temporarily closed or at limited capacity; verify before visiting"),
  lounge("chase-sapphire-las", "Chase Sapphire Lounge by The Club", "chase-sapphire", "LAS", "Terminal 1, Concourse C", "Near gate C23, after security"),
  lounge("chase-sapphire-lga-b", "Chase Sapphire Lounge by The Club", "chase-sapphire", "LGA", "Terminal B", "After security, next to the Centurion Lounge"),
  lounge("chase-sapphire-phl-de", "Chase Sapphire Lounge by The Club", "chase-sapphire", "PHL", "Terminals D/E", "D/E connector, just past security"),
  lounge("chase-sapphire-phx-t4", "Chase Sapphire Lounge by The Club", "chase-sapphire", "PHX", "Terminal 4", "S1 concourse, on the left on the way to gates D11–D18 (past the first D gates)"),
  lounge("chase-sapphire-san-t2", "Chase Sapphire Lounge by The Club", "chase-sapphire", "SAN", "Terminal 2 West", "After security"),
  lounge("chase-sapphire-iad-etihad", "Etihad Lounge (Chase Sapphire partner)", "chase-sapphire", "IAD", "Concourse A", "Near gate A14", "Etihad-operated partner lounge open to Sapphire Reserve cardmembers; not a Chase-run lounge"),

  // ---------------------------------------------------------------------------
  // Delta Sky Clubs (representative set at hubs and major airports)
  // ---------------------------------------------------------------------------
  lounge("delta-sky-club-atl-t", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse T", "Near gate T6"),
  lounge("delta-sky-club-atl-a-center", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse A", "Center of concourse, 2nd level"),
  lounge("delta-sky-club-atl-a17", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse A", "Near gate A17"),
  lounge("delta-sky-club-atl-b", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse B", "Near gate B18"),
  lounge("delta-sky-club-atl-c", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse C", "Near gate C37"),
  lounge("delta-sky-club-atl-d", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse D", "Central core of the concourse", "Newer, larger club"),
  lounge("delta-sky-club-atl-e", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse E", "Across from gate E15", "Showers available"),
  lounge("delta-sky-club-atl-f", "Delta Sky Club", "delta-sky-club", "ATL", "Concourse F", "Mezzanine level", "Sky Deck and showers"),
  lounge("delta-sky-club-dtw-a38", "Delta Sky Club", "delta-sky-club", "DTW", "McNamara Terminal, Concourse A", "Gate level at the link, across from gate A38", "Showers available"),
  lounge("delta-sky-club-dtw-a68", "Delta Sky Club", "delta-sky-club", "DTW", "McNamara Terminal, Concourse A", "Level 2 at Express Tram North Station, across from gate A68"),
  lounge("delta-sky-club-msp-c", "Delta Sky Club", "delta-sky-club", "MSP", "Terminal 1, Concourse C", "Next to gate C12"),
  lounge("delta-sky-club-msp-f", "Delta Sky Club", "delta-sky-club", "MSP", "Terminal 1, Concourse F", "At the start of Concourse F"),
  lounge("delta-sky-club-msp-g", "Delta Sky Club", "delta-sky-club", "MSP", "Terminal 1, Concourse G", "Between gates G17 and G18", "Newest and largest MSP club"),
  lounge("delta-sky-club-jfk-t4-a", "Delta Sky Club", "delta-sky-club", "JFK", "Terminal 4, Concourse A", "Near gate A8"),
  lounge("delta-sky-club-jfk-t4-b", "Delta Sky Club", "delta-sky-club", "JFK", "Terminal 4, Concourse B", "Near gate B31", "Sky Deck"),
  lounge("delta-sky-club-lga-c", "Delta Sky Club", "delta-sky-club", "LGA", "Terminal C", "Just past security, to the left of the checkpoint exit"),
  lounge("delta-sky-club-bos-a", "Delta Sky Club", "delta-sky-club", "BOS", "Terminal A", "Main terminal", "BOS has multiple Delta clubs (Terminal A and its satellite); Delta One Lounge in Terminal E is separate"),
  lounge("delta-sky-club-lax-t2", "Delta Sky Club", "delta-sky-club", "LAX", "Terminal 2", "Mezzanine level"),
  lounge("delta-sky-club-lax-t3", "Delta Sky Club", "delta-sky-club", "LAX", "Terminal 3", "In the Sky Way corridor connecting Terminals 2 and 3"),
  lounge("delta-sky-club-sea-a", "Delta Sky Club", "delta-sky-club", "SEA", "Concourse A", "Near gate A11"),
  lounge("delta-sky-club-slc-a", "Delta Sky Club", "delta-sky-club", "SLC", "Concourse A"),
  lounge("delta-sky-club-slc-b", "Delta Sky Club", "delta-sky-club", "SLC", "Concourse B", undefined, "Opened Oct 28, 2025"),
  lounge("delta-sky-club-sfo-t1", "Delta Sky Club", "delta-sky-club", "SFO", "Harvey Milk Terminal 1", "Near gate C3, immediately to the left after security"),
  lounge("delta-sky-club-ord-t5", "Delta Sky Club", "delta-sky-club", "ORD", "Terminal 5, Concourse M", "Between gates M11 and M14", "Showers available"),
  lounge("delta-sky-club-dca-b", "Delta Sky Club", "delta-sky-club", "DCA", "Terminal 2, Concourse B", "Above gate 15"),
  lounge("delta-sky-club-mco-4", "Delta Sky Club", "delta-sky-club", "MCO", "Terminal A/B, Airside 4", "Near gate 71"),
  lounge("delta-sky-club-mia-h", "Delta Sky Club", "delta-sky-club", "MIA", "Concourse H", "Airside in the H–J connector, left of the Concourse H security checkpoint"),
  lounge("delta-sky-club-aus", "Delta Sky Club", "delta-sky-club", "AUS", "Barbara Jordan Terminal", "After security"),
  lounge("delta-sky-club-den-a", "Delta Sky Club", "delta-sky-club", "DEN", "Concourse A", "Center core of Concourse A, 4th floor; reached directly via the pedestrian bridge (A Bridge) from security", "Reopened March 4, 2026 at ~13,000 sq ft (nearly 3x larger)"),
  lounge("delta-sky-club-phl-de", "Delta Sky Club", "delta-sky-club", "PHL", "Terminals D/E", undefined, "Renovated Feb 2026; capacity doubled to 140+ seats. Note: Delta has no airport Sky Club at LAS yet (planned ~2029)"),

  // ---------------------------------------------------------------------------
  // United Clubs (representative set at hubs)
  // ---------------------------------------------------------------------------
  lounge("united-club-ord-b6", "United Club", "united-club", "ORD", "Terminal 1, Concourse B", "Near gate B6"),
  lounge("united-club-ord-b18", "United Club", "united-club", "ORD", "Terminal 1, Concourse B", "Near gate B18"),
  lounge("united-club-ord-c10", "United Club", "united-club", "ORD", "Terminal 1, Concourse C", "Near gate C10"),
  lounge("united-club-ord-t2", "United Club", "united-club", "ORD", "Terminal 2", "Near gate E7"),
  lounge("united-club-ewr-c1", "United Club", "united-club", "EWR", "Terminal C", "C1 concourse", "Several United Clubs in Terminal C (C1, C2, C3)"),
  lounge("united-club-ewr-c3", "United Club", "united-club", "EWR", "Terminal C", "C3 concourse"),
  lounge("united-club-iah-e", "United Club", "united-club", "IAH", "Terminal E", "Between gates E11 and E12"),
  lounge("united-club-iah-c", "United Club", "united-club", "IAH", "Terminal C"),
  lounge("united-club-fly-iah-b", "United Club Fly", "united-club", "IAH", "Terminal B", "Near gates B12–B20", "Grab-and-go club concept"),
  lounge("united-club-den-a", "United Club", "united-club", "DEN", "Concourse A", undefined, "One of four United Clubs at DEN"),
  lounge("united-club-den-b-center", "United Club", "united-club", "DEN", "Concourse B", "Center of concourse", "United's largest club"),
  lounge("united-club-den-b-east", "United Club", "united-club", "DEN", "Concourse B", "East side"),
  lounge("united-club-den-b-west", "United Club", "united-club", "DEN", "Concourse B", "West side"),
  lounge("united-club-sfo-t3", "United Club", "united-club", "SFO", "Terminal 3", "Concourse F"),
  lounge("united-club-sfo-intl-g", "United Club", "united-club", "SFO", "International Terminal", "Concourse G"),
  lounge("united-club-iad-c", "United Club", "united-club", "IAD", "Concourse C"),
  lounge("united-club-iad-d", "United Club", "united-club", "IAD", "Concourse D"),
  lounge("united-club-lax-t7", "United Club", "united-club", "LAX", "Terminal 7"),

  // ---------------------------------------------------------------------------
  // Admirals Clubs (representative set at hubs)
  // ---------------------------------------------------------------------------
  lounge("admirals-club-dfw-a", "Admirals Club", "admirals-club", "DFW", "Terminal A", "Across from gate A24"),
  lounge("admirals-club-dfw-b", "Admirals Club", "admirals-club", "DFW", "Terminal B", "Between gates B3 and B4"),
  lounge("admirals-club-dfw-c", "Admirals Club", "admirals-club", "DFW", "Terminal C", "Between gates C19 and C20"),
  lounge("admirals-club-dfw-d", "Admirals Club", "admirals-club", "DFW", "Terminal D", "Near gate D24"),
  lounge("admirals-club-dfw-e", "Admirals Club", "admirals-club", "DFW", "Terminal E", "Mezzanine level"),
  lounge("admirals-club-clt-b", "Admirals Club", "admirals-club", "CLT", "Concourse B", "Between gates B3 and B5"),
  lounge("admirals-club-clt-d", "Admirals Club", "admirals-club", "CLT", "Concourse D"),
  lounge("admirals-provisions-clt-a", "Provisions by Admirals Club", "admirals-club", "CLT", "Concourse A", "Near gate A1", "Grab-and-go concept"),
  lounge("admirals-club-ord-g", "Admirals Club", "admirals-club", "ORD", "Terminal 3, Concourse G", "Across from gate G8"),
  lounge("admirals-club-ord-hk", "Admirals Club", "admirals-club", "ORD", "Terminal 3, Concourse H/K", "Between gates H6 and K6"),
  lounge("admirals-club-ord-l", "Admirals Club", "admirals-club", "ORD", "Terminal 3, Concourse L", "Before gate L1"),
  lounge("admirals-club-mia-d30", "Admirals Club", "admirals-club", "MIA", "North Terminal, Concourse D", "Across from gate D30"),
  lounge("admirals-club-mia-d15", "Admirals Club", "admirals-club", "MIA", "North Terminal, Concourse D", "3rd floor above gate D15", "The Concourse E club has been reported temporarily closed"),
  lounge("admirals-club-jfk-t8", "Admirals Club", "admirals-club", "JFK", "Terminal 8"),
  lounge("admirals-club-lax-t4", "Admirals Club", "admirals-club", "LAX", "Terminal 4"),
  lounge("admirals-club-lga-b", "Admirals Club", "admirals-club", "LGA", "Terminal B"),
  lounge("admirals-club-phl-bc", "Admirals Club", "admirals-club", "PHL", "Terminals B/C"),
  lounge("admirals-club-phx-t4", "Admirals Club", "admirals-club", "PHX", "Terminal 4", "Above gates A7 and A9", "Terminal 4 has two more Admirals Clubs: between gates A19 and A21, and above gates B5 and B7"),
  lounge("admirals-club-dca-t2", "Admirals Club", "admirals-club", "DCA", "Terminal 2"),

  // ---------------------------------------------------------------------------
  // Alaska Lounges
  // ---------------------------------------------------------------------------
  lounge("alaska-lounge-sea-c", "Alaska Lounge", "alaska-lounge", "SEA", "Concourse C", "Mezzanine level"),
  lounge("alaska-lounge-sea-d", "Alaska Lounge", "alaska-lounge", "SEA", "Concourse D", "Near gate D1"),
  lounge("alaska-lounge-sea-n", "Alaska Lounge", "alaska-lounge", "SEA", "North Satellite (N gates)", undefined, "Largest Alaska Lounge; a new premium flagship at SEA is planned for 2027"),
  lounge("alaska-lounge-pdx", "Alaska Lounge", "alaska-lounge", "PDX", "Main Terminal", "After security", "Opened June 4, 2026 (~14,000 sq ft); replaced the former Concourse B and C lounges"),
  lounge("alaska-lounge-anc-c", "Alaska Lounge", "alaska-lounge", "ANC", "Concourse C", "Near gate C1"),
  lounge("alaska-lounge-sfo-t1", "Alaska Lounge", "alaska-lounge", "SFO", "Harvey Milk Terminal 1", "Across from gate B6", "Also accessible via Priority Pass ($15 co-pay)"),
  lounge("alaska-lounge-lax-t6", "Alaska Lounge", "alaska-lounge", "LAX", "Terminal 6", "Mezzanine level near gate 64"),
  lounge("alaska-plumeria-lounge-hnl", "The Plumeria Lounge", "alaska-lounge", "HNL", "Terminal 1", "Third floor", "Hawaiian Airlines lounge included with Alaska Lounge membership"),

  // ---------------------------------------------------------------------------
  // Plaza Premium Lounges
  // ---------------------------------------------------------------------------
  {
    ...lounge("plaza-premium-first-dfw-d", "Plaza Premium First", "plaza-premium", "DFW", "Terminal D", undefined, "Opened April 2026; first Plaza Premium First in the US. Not in Priority Pass"),
    cardAccessUnconfirmed: "The card terms we track cover Plaza Premium Lounges and don't mention Plaza Premium First, so no card is counted as getting in.",
  },
  lounge("plaza-premium-dfw-d", "Plaza Premium Lounge", "plaza-premium", "DFW", "Terminal D", undefined, "Reimagined lounge opened April 2026; reported to have left Priority Pass"),
  lounge("plaza-premium-mco-c", "Plaza Premium Lounge", "plaza-premium", "MCO", "Terminal C", "Level 2, near gate 241", `${PP_NOTE}. Terminal C is not airside-connected to Terminals A/B`),
  lounge("plaza-premium-lhr-t2", "Plaza Premium Lounge", "plaza-premium", "LHR", "Terminal 2", "Level 4, near the Terminal Transfers area, after security", `${PP_NOTE} (listed by Priority Pass; some reports say PP entry is restricted)`),
  lounge("plaza-premium-lhr-t4", "Plaza Premium Lounge", "plaza-premium", "LHR", "Terminal 4", "Level 2, opposite gate 10 (10A/10B)", `${PP_NOTE} (listed by Priority Pass; check its app before you go)`),
  lounge("plaza-premium-lhr-t5", "Plaza Premium Lounge", "plaza-premium", "LHR", "Terminal 5", "Next to gate A7, level 2, after security", `${PP_NOTE} (listed by Priority Pass; check its app before you go)`),
  lounge("plaza-premium-hkg-gate1", "Plaza Premium Lounge (Gate 1)", "plaza-premium", "HKG", "Terminal 1", "Near gate 1", PP_NOTE),
  lounge("plaza-premium-hkg-gate35", "Plaza Premium Lounge (Gate 35)", "plaza-premium", "HKG", "Terminal 1", "Near gate 35", PP_NOTE),
  lounge("plaza-premium-hkg-gate60", "Plaza Premium Lounge (Gate 60)", "plaza-premium", "HKG", "Terminal 1", "Level 7, near gate 60", `${PP_NOTE}; open 6:00am–1:00am`),
  lounge("plaza-premium-sin-t1", "Plaza Premium Lounge", "plaza-premium", "SIN", "Terminal 1", "Transit area", PP_NOTE),
  lounge("plaza-premium-yyz-t1-intl", "Plaza Premium Lounge (International)", "plaza-premium", "YYZ", "Terminal 1", "International departures", PP_NOTE),
  lounge("plaza-premium-yyz-t1-domestic", "Plaza Premium Lounge (Domestic)", "plaza-premium", "YYZ", "Terminal 1", "Domestic departures", PP_NOTE),
  lounge("plaza-premium-yyz-t3-intl", "Plaza Premium Lounge (International)", "plaza-premium", "YYZ", "Terminal 3", "International departures", PP_NOTE),
  lounge("plaza-premium-yyz-t3-transborder", "Plaza Premium Lounge (Transborder)", "plaza-premium", "YYZ", "Terminal 3", "U.S. departures gates", PP_NOTE),

  // ---------------------------------------------------------------------------
  // Escape Lounges (US)
  // ---------------------------------------------------------------------------
  lounge("escape-msp-t1", "Escape Lounge – The Centurion Studio Partner", "escape", "MSP", "Terminal 1", "Mezzanine level", "Amex Platinum access; most US Escape Lounges joined Priority Pass in 2024 (check the Priority Pass app for this one)"),
  lounge("escape-phx-t3", "Escape Lounge", "escape", "PHX", "Terminal 3", "Level 4, airside between the E and F gates", PP_NOTE),
  lounge("escape-phx-t4", "Escape Lounge – The Centurion Studio Partner", "escape", "PHX", "Terminal 4", "Concourse B, level 3, across from gate B22", "Not in Priority Pass"),
  lounge("escape-cvg-b", "Escape Lounge – The Centurion Studio Partner", "escape", "CVG", "Concourse B", undefined, PP_NOTE),
  lounge("escape-bdl-a", "Escape Lounge – The Centurion Studio Partner", "escape", "BDL", "Terminal A", undefined, PP_NOTE),
  lounge("escape-smf-a", "Escape Lounge", "escape", "SMF", "Terminal A", undefined, PP_NOTE),
  lounge("escape-smf-b", "Escape Lounge", "escape", "SMF", "Terminal B", undefined, PP_NOTE),

  // ---------------------------------------------------------------------------
  // Airspace
  // ---------------------------------------------------------------------------
  lounge("airspace-san-t2", "Airspace Lounge", "airspace", "SAN", "Terminal 2", "After security", `${PP_NOTE}. Recent reports say it has been rebranded as an Aspire Lounge`),

  // ---------------------------------------------------------------------------
  // Priority Pass lounges — United States
  // (Chase Sapphire Lounges left Priority Pass on Aug 15, 2026)
  // ---------------------------------------------------------------------------
  lounge("pp-atl-the-club-f", "The Club ATL", "priority-pass", "ATL", "Concourse F", undefined, "Only traditional Priority Pass lounge at ATL"),
  lounge("pp-atl-poppin-f", "Poppin by The Club", "priority-pass", "ATL", "Concourse F", "Beside The Club ATL", "Opened 2026; grab-and-go lounge (no showers or bar)"),
  lounge("pp-atl-minute-suites-b", "Minute Suites", "priority-pass", "ATL", "Concourse B", undefined, "Private suites; 1 hour via Priority Pass"),
  lounge("pp-atl-minute-suites-e", "Minute Suites", "priority-pass", "ATL", "Concourse E", undefined, "Private suites; 1 hour via Priority Pass"),
  lounge("pp-atl-minute-suites-f", "Minute Suites", "priority-pass", "ATL", "Concourse F", undefined, "Private suites; 1 hour via Priority Pass"),
  lounge("pp-bos-air-france-e", "Air France Lounge", "priority-pass", "BOS", "Terminal E", undefined, "Priority Pass participation has varied; verify in app"),
  lounge("pp-bwi-the-club-d", "The Club BWI", "priority-pass", "BWI", "Concourse D", "Near gate D10"),
  lounge("pp-clt-the-club-a", "The Club CLT", "priority-pass", "CLT", "Concourse A", "Just before gates A21 and A22, on the left as you walk toward gates A21–A29", "Showers no longer included with access from July 1, 2026"),
  lounge("pp-clt-minute-suites", "Minute Suites", "priority-pass", "CLT", "Atrium", "Main Atrium between Concourses B and C, next to the food court", "Private suites; 1 hour via Priority Pass"),
  lounge("pp-dfw-minute-suites-a", "Minute Suites", "priority-pass", "DFW", "Terminal A", "Near gate A38", "Private suites; 1 hour via Priority Pass"),
  lounge("pp-iad-air-france-a", "Air France-KLM Lounge", "priority-pass", "IAD", "Concourse A", "Near gate A20", "Priority Pass access mainly early in the day; may be restricted when busy"),
  lounge("pp-iad-virgin-atlantic-a", "Virgin Atlantic Clubhouse", "priority-pass", "IAD", "Concourse A", "Opposite gate A32", "Limited hours; most food and drink is paid for Priority Pass guests"),
  lounge("pp-iad-turkish-b", "Turkish Airlines Lounge", "priority-pass", "IAD", "Concourse B", "Next to gate B43, concourse level"),
  lounge("pp-iah-air-france-d", "Air France Lounge", "priority-pass", "IAH", "Terminal D", "Opposite gate D18 (D18B), after security", "Priority Pass entry only about 10–11am and 5–7pm (no entry 11am–5pm); 3-hour max stay"),
  lounge("pp-iah-klm-d", "KLM Crown Lounge", "priority-pass", "IAH", "Terminal D", "Near gate D16, after security", "Priority Pass hours approx. 10am–7pm (vary with flights); entry often restricted 11am–5pm when busy; 3-hour max stay"),
  lounge("pp-jfk-air-france-t1", "Air France Lounge", "priority-pass", "JFK", "Terminal 1", undefined, "Terminal 1 airlines are moving to the New Terminal One; verify status"),
  lounge("pp-jfk-primeclass-t1", "Primeclass Lounge", "priority-pass", "JFK", "Terminal 1"),
  lounge("pp-jfk-air-india-t4", "Air India Maharaja Lounge", "priority-pass", "JFK", "Terminal 4"),
  lounge("pp-las-the-club-t1", "The Club LAS", "priority-pass", "LAS", "Terminal 1", "Near gate D33"),
  lounge("pp-las-the-club-t3", "The Club LAS", "priority-pass", "LAS", "Terminal 3", "Across from gate E2"),
  lounge("pp-lax-virgin-atlantic-tbit", "Virgin Atlantic Clubhouse", "priority-pass", "LAX", "Tom Bradley International Terminal", "Level 6: after security, take the lift near the clock tower in the main atrium", "Only Priority Pass lounge at LAX; $35 fee for Priority Pass members and frequent capacity limits"),
  lounge("pp-mco-the-club-4", "The Club MCO", "priority-pass", "MCO", "Terminal B, Airside 4", "Near gate 91", "Often crowded"),
  lounge("pp-mia-turkish-e", "Turkish Airlines Lounge", "priority-pass", "MIA", "Concourse E", "Level 2, after the Concourse E security checkpoint (past the escalator, on the left)"),
  lounge("pp-mia-turkish-hj", "Turkish Airlines Lounge", "priority-pass", "MIA", "Concourse H/J", "3rd floor of the H–J connector, after security (take the elevator midway between concourses H and J)", "Second Turkish lounge at MIA"),
  lounge("pp-ord-air-france-t5", "Air France Lounge", "priority-pass", "ORD", "Terminal 5", "After security and duty free, turn left; on the right near gate M17", "New lounge; the Swissport lounge in T5 closed permanently Oct 31, 2026"),
  lounge("pp-phl-minute-suites", "Minute Suites", "priority-pass", "PHL", "Terminals A/B", "A/B connector", "Private suites; 1 hour via Priority Pass"),
  lounge("pp-sea-the-club-a", "The Club SEA", "priority-pass", "SEA", "Concourse A", "Across from gate A11", "Open 5:00am–12:30am. Chase has sought this space (plus an adjoining area) for a future Sapphire Lounge; no date announced"),
  lounge("pp-sea-the-club-s", "The Club SEA", "priority-pass", "SEA", "South Satellite (S gates)", "Mezzanine level, above gate S9", "Showers available. S Concourse construction closure was postponed; open as of Nov 2026, check before visiting"),
  lounge("pp-sfo-the-club-t1", "The Club SFO", "priority-pass", "SFO", "Harvey Milk Terminal 1", "Just before gate B4, Boarding Area B, after security"),
  lounge("pp-sfo-british-airways-intl", "British Airways Lounge", "priority-pass", "SFO", "International Terminal A", undefined, "Priority Pass access mornings only (approx. 5:00–11:30am)"),
  lounge("pp-sjc-the-club-a", "The Club SJC", "priority-pass", "SJC", "Terminal A", "Near gate A8"),

  // ---------------------------------------------------------------------------
  // Priority Pass lounges — International hubs
  // ---------------------------------------------------------------------------
  lounge("pp-lhr-no1-t3", "No1 Lounge", "priority-pass", "LHR", "Terminal 3", "Lounge F, one level up on the way to gates 13–22", "Pre-booking recommended"),
  closedLounge(
    lounge("pp-lhr-club-aspire-t3", "Club Aspire", "priority-pass", "LHR", "Terminal 5", "To the left of gate A18, main departure building (5A)", "Temporarily closed for refurbishment (reported Nov 2, 2026–Apr 16, 2027), due to reopen as a No1 Lounge. Terminal 3's Club Aspire became My Lounge in July 2025"),
    { from: "2026-11-02", until: "2027-04-16", untilLabel: "Apr 16, 2027 (reported)" },
  ),
  lounge("pp-cdg-star-alliance-t1", "Star Alliance Lounge", "priority-pass", "CDG", "Terminal 1", "Airside"),
  lounge("pp-fra-priority-lounge-t3", "Priority Lounge", "priority-pass", "FRA", "Terminal 3", "Level 5", "Terminal 3 opened April 2026; open approx. 6:15am–9:15pm"),
  lounge("pp-ams-aspire-26", "Aspire Lounge 26", "priority-pass", "AMS", "Main terminal (Schengen)", "Lounge 26"),
  lounge("pp-ams-aspire-41", "Aspire Lounge 41", "priority-pass", "AMS", "Main terminal (non-Schengen)", "Lounge 41", "Verify current Priority Pass participation"),
  lounge("pp-dxb-marhaba-t1", "marhaba Lounge", "priority-pass", "DXB", "Terminal 1", "Concourse D"),
  lounge("pp-dxb-ahlan-business-t1", "Ahlan Business Lounge", "priority-pass", "DXB", "Terminal 1", "Concourse D"),
  lounge("pp-nrt-kocoo-t2", "I.A.S.S Superior Lounge -KoCoo-", "priority-pass", "NRT", "Terminal 2", "4th floor, airside international departures", "2-hour maximum stay; ANA and KAL lounges no longer in Priority Pass"),
  lounge("pp-sin-sats-premier-t1", "SATS Premier Lounge", "priority-pass", "SIN", "Terminal 1", "Transit area"),
  lounge("pp-sin-marhaba-t1", "Marhaba Lounge", "priority-pass", "SIN", "Terminal 1", "Transit area"),
  lounge("pp-sin-sats-premier-t3", "SATS Premier Lounge", "priority-pass", "SIN", "Terminal 3", "Transit area"),
  lounge("pp-cun-mera-t3", "Mera Business Lounge", "priority-pass", "CUN", "Terminal 3", undefined, "Priority Pass participation reported inconsistently; verify in app"),
  lounge("pp-mex-grand-lounge-elite-t1", "The Grand Lounge Elite", "priority-pass", "MEX", "Terminal 1", "International departures"),
];
