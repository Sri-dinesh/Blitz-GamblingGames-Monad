import { NextResponse } from "next/server";

type CricApiTeam = {
  name?: string;
  shortname?: string;
  img?: string;
};

type CricApiScore = {
  inning?: string;
  r?: number;
  w?: number;
  o?: number;
};

type CricApiMatch = {
  id?: string;
  name?: string;
  status?: string;
  matchType?: string;
  dateTimeGMT?: string;
  venue?: string;
  teamInfo?: CricApiTeam[];
  score?: CricApiScore[];
};

type PublicMatch = {
  id: string;
  name: string;
  status: string;
  matchType: string;
  dateTimeGMT: string;
  venue: string;
  teams: Array<{ name: string; shortName: string; logo: string }>;
  score: Array<{ inning: string; runs: number; wickets: number; overs: number }>;
  winner: string | null;
  isFinished: boolean;
};

const MATCH_RESULT_RX = /(.+?)\s+won\b/i;

const getWinnerFromStatus = (status: string, teams: string[]) => {
  const match = status.match(MATCH_RESULT_RX);
  if (!match?.[1]) return null;
  const candidate = match[1].trim().toLowerCase();
  return teams.find((team) => team.toLowerCase() === candidate) ?? null;
};

const isMatchFinished = (status: string) => {
  const text = status.toLowerCase();
  return (
    text.includes(" won") ||
    text.includes("match over") ||
    text.includes("result") ||
    text.includes("abandoned") ||
    text.includes("tied")
  );
};

const normalizeMatch = (raw: CricApiMatch): PublicMatch | null => {
  const id = raw.id?.trim();
  const teams = (raw.teamInfo ?? []).slice(0, 2).map((team) => ({
    name: team.name?.trim() || "Unknown",
    shortName: team.shortname?.trim() || team.name?.trim() || "UNK",
    logo: team.img?.trim() || "",
  }));

  if (!id || teams.length < 2) return null;

  const status = raw.status?.trim() || "Status unavailable";
  const teamNames = teams.map((team) => team.name);

  return {
    id,
    name: raw.name?.trim() || `${teams[0].name} vs ${teams[1].name}`,
    status,
    matchType: raw.matchType?.trim() || "unknown",
    dateTimeGMT: raw.dateTimeGMT?.trim() || "",
    venue: raw.venue?.trim() || "TBD",
    teams,
    score: (raw.score ?? []).map((entry) => ({
      inning: entry.inning?.trim() || "",
      runs: Number(entry.r ?? 0),
      wickets: Number(entry.w ?? 0),
      overs: Number(entry.o ?? 0),
    })),
    winner: getWinnerFromStatus(status, teamNames),
    isFinished: isMatchFinished(status),
  };
};

export async function GET() {
  const apiKey = process.env.CRICAPI_KEY || process.env.CRICKET_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing CRICAPI_KEY. Add it to your environment to fetch live cricket data.",
        matches: [],
      },
      { status: 200 },
    );
  }

  try {
    const upstream = await fetch(
      `https://api.cricapi.com/v1/currentMatches?apikey=${encodeURIComponent(apiKey)}&offset=0`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Cricket API request failed with ${upstream.status}.`, matches: [] },
        { status: 200 },
      );
    }

    const json = (await upstream.json()) as { data?: CricApiMatch[]; status?: string; reason?: string };

    const matches = (json.data ?? [])
      .map(normalizeMatch)
      .filter((match): match is PublicMatch => Boolean(match));

    return NextResponse.json({
      source: "cricapi",
      upstreamStatus: json.status ?? "unknown",
      upstreamReason: json.reason ?? "",
      fetchedAt: new Date().toISOString(),
      matches,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message, matches: [] }, { status: 200 });
  }
}
