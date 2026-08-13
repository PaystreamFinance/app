export type RwaAssetId = "CL" | "BRENT" | "NATGAS";

export interface RwaRollEvent {
  id: string;
  assetId: RwaAssetId;
  assetLabel: string;
  venue: string;
  openInterest: string;
  fromContract: string;
  toContract: string;
  expiry: Date;
  start: Date;
  end: Date;
  methodology: string;
  docsUrl: string;
  /** How the oracle weight transitions: linear blend vs discrete steps. */
  lineType: "linear" | "step";
}

const FUTURES_MONTH_CODES = [
  "F",
  "G",
  "H",
  "J",
  "K",
  "M",
  "N",
  "Q",
  "U",
  "V",
  "X",
  "Z",
] as const;

const ASSETS = {
  CL: {
    label: "WTI Crude Oil",
    prefix: "CL",
    expiry: clLtd,
  },
  BRENT: {
    label: "Brent Crude Oil",
    prefix: "BRN",
    expiry: brentLtd,
  },
  NATGAS: {
    label: "Natural Gas",
    prefix: "NG",
    expiry: ngLtd,
  },
} as const;

const VENUES = [
  {
    name: "Trade[XYZ]",
    oi: { CL: "33.9%", BRENT: "97.0%", NATGAS: "22.9%" },
    docsUrl: "https://docs.trade.xyz/consolidated-resources/roll-schedules",
    methodology:
      "Linear blend from BD5 to BD9 of the anchor month, stepping at 17:30 ET.",
    startsOnBd: 5,
    endsOnBd: 9,
    time: "17:30",
    assets: ["CL", "BRENT", "NATGAS"],
    type: "anchor-month",
    lineType: "step",
  },
  {
    name: "Binance",
    oi: { CL: "33.1%", BRENT: "n/a", NATGAS: "20.9%" },
    docsUrl:
      "https://www.binance.com/en/support/faq/detail/0675298e133640f48aab7e3bb4ae1d38",
    methodology:
      "Linear blend from BD5 to BD9 of the anchor month, stepping at 17:00 ET.",
    startsOnBd: 5,
    endsOnBd: 9,
    time: "17:00",
    assets: ["CL", "BRENT", "NATGAS"],
    type: "anchor-month",
    lineType: "step",
  },
  {
    name: "OKX",
    oi: { CL: "5.2%", BRENT: "n/a", NATGAS: "n/a" },
    docsUrl: "https://www.okx.com/help/commodity-perpetuals",
    methodology:
      "Linear blend from BD5 to BD9 of the anchor month, stepping at 17:30 ET.",
    startsOnBd: 5,
    endsOnBd: 9,
    time: "17:30",
    assets: ["CL", "BRENT"],
    type: "anchor-month",
    lineType: "step",
  },
  {
    name: "Lighter",
    oi: { CL: "2.9%", BRENT: "1.8%", NATGAS: "7.5%" },
    docsUrl:
      "https://docs.lighter.xyz/trading/real-world-assets-rwas/futures-contract-price-rolling-mechanism",
    methodology:
      "Linear blend from BD5 to BD9 of the anchor month, stepping at asset-specific ET cutoffs.",
    startsOnBd: 5,
    endsOnBd: 9,
    timeByAsset: { CL: "17:30", BRENT: "19:00", NATGAS: "17:30" },
    assets: ["CL", "BRENT", "NATGAS"],
    type: "anchor-month",
    lineType: "step",
  },
  {
    name: "Bybit",
    oi: { CL: "2.4%", BRENT: "n/a", NATGAS: "n/a" },
    docsUrl:
      "https://www.bybit.com/en/help-center/article/Introduction-to-TradFi-Perpetual-Contracts",
    methodology: "5-step blend at 17:00 ET on BD-7 to BD-3 before LTD.",
    startsBeforeLtdBd: 7,
    endsBeforeLtdBd: 3,
    time: "17:00",
    assets: ["CL", "BRENT"],
    type: "before-ltd",
    lineType: "step",
  },
  {
    name: "Dreamcash",
    oi: { CL: "0.6%", BRENT: "n/a", NATGAS: "n/a" },
    docsUrl: "https://docs.dreamcash.xyz/markets/commodities",
    methodology:
      "Single 23h linear blend starting 18:00 ET about 6 business days before LTD.",
    startsBeforeLtdBd: 6,
    endOffsetDays: 1,
    startTime: "18:00",
    endTime: "17:00",
    assets: ["CL"],
    type: "single-session",
    lineType: "linear",
  },
  {
    name: "Extended",
    oi: { CL: "0.3%", BRENT: "0.2%", NATGAS: "0.5%" },
    docsUrl:
      "https://docs.extended.exchange/extended-resources/trading/tradfi-markets",
    methodology:
      "Linear blend from BD5 to BD9 of the anchor month, stepping at 17:30 ET.",
    startsOnBd: 5,
    endsOnBd: 9,
    time: "17:30",
    assets: ["CL", "BRENT", "NATGAS"],
    type: "anchor-month",
    lineType: "step",
  },
  {
    name: "Felix",
    oi: { CL: "0.3%", BRENT: "n/a", NATGAS: "2.6%" },
    docsUrl:
      "https://usefelix.gitbook.io/perps/getting-started/perp-specifications/crude-oil-wti",
    methodology: "Step blend at 16:30 ET before LTD.",
    time: "16:30",
    startsBeforeLtdBdByAsset: { CL: 15, NATGAS: 16 },
    endsBeforeLtdBd: 12,
    assets: ["CL", "NATGAS"],
    type: "before-ltd",
    lineType: "step",
  },
] as const;

export function getRwaRollCalendarForMonth(
  date = new Date(),
): RwaRollEvent[] {
  const viewMonthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const viewMonthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const deliveryMonths = Array.from({ length: 6 }, (_, index) =>
    addMonths(viewMonthStart, index - 1),
  );

  return Object.entries(ASSETS)
    .flatMap(([assetId, asset]) =>
      deliveryMonths.flatMap((deliveryDate) =>
        VENUES.filter((venue) =>
          (venue.assets as readonly string[]).includes(assetId),
        ).map((venue) => {
          const nextDeliveryDate = addMonths(deliveryDate, 1);
          const expiry = asset.expiry(
            deliveryDate.getFullYear(),
            deliveryDate.getMonth() + 1,
          );
          const time =
            "timeByAsset" in venue
              ? venue.timeByAsset[assetId as keyof typeof venue.timeByAsset]
              : "time" in venue
                ? venue.time
                : venue.startTime;
          const [start, end] = rollWindowForVenue(
            venue,
            deliveryDate,
            expiry,
            time,
            assetId as RwaAssetId,
          );

          return {
            id: `${assetId}-${venue.name}-${contractSymbol(
              asset.prefix,
              deliveryDate,
            )}`,
            assetId: assetId as RwaAssetId,
            assetLabel: asset.label,
            venue: venue.name,
            openInterest: venue.oi[assetId as keyof typeof venue.oi] ?? "n/a",
            fromContract: contractSymbol(asset.prefix, deliveryDate),
            toContract: contractSymbol(asset.prefix, nextDeliveryDate),
            expiry: withEtTime(expiry, "14:30"),
            start,
            end,
            methodology: venue.methodology,
            docsUrl: venue.docsUrl,
            lineType: venue.lineType,
          } satisfies RwaRollEvent;
        }),
      ),
    )
    .filter((event) =>
      overlaps(event.start, event.end, viewMonthStart, viewMonthEnd),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function rollWindowForVenue(
  venue: (typeof VENUES)[number],
  deliveryDate: Date,
  expiry: Date,
  time: string,
  assetId: RwaAssetId,
): [Date, Date] {
  if (venue.type === "anchor-month") {
    const anchorMonth = addMonths(deliveryDate, -1);
    const start = nthBdOfMonth(
      anchorMonth.getFullYear(),
      anchorMonth.getMonth() + 1,
      venue.startsOnBd,
    );
    const end = nthBdOfMonth(
      anchorMonth.getFullYear(),
      anchorMonth.getMonth() + 1,
      venue.endsOnBd,
    );
    return [withEtTime(start, time), withEtTime(end, time)];
  }

  if (venue.type === "single-session") {
    const start = addBd(expiry, -venue.startsBeforeLtdBd);
    const end = addDays(start, venue.endOffsetDays);
    return [withEtTime(start, venue.startTime), withEtTime(end, venue.endTime)];
  }

  const startsBeforeLtdBd =
    "startsBeforeLtdBdByAsset" in venue
      ? venue.startsBeforeLtdBdByAsset[
          assetId as keyof typeof venue.startsBeforeLtdBdByAsset
        ]
      : venue.startsBeforeLtdBd;
  const start = addBd(expiry, -startsBeforeLtdBd);
  const end = addBd(expiry, -venue.endsBeforeLtdBd);
  return [withEtTime(start, time), withEtTime(end, time)];
}

function clLtd(year: number, month: number): Date {
  const previous = addMonths(new Date(year, month - 1, 1), -1);
  let day = new Date(previous.getFullYear(), previous.getMonth(), 25);
  while (!isBd(day)) day = addDays(day, -1);
  return addBd(day, -3);
}

function ngLtd(year: number, month: number): Date {
  let day = lastDayOfMonth(addMonths(new Date(year, month - 1, 1), -1));
  let count = 0;
  while (count < 3) {
    if (isBd(day)) count += 1;
    if (count === 3) return day;
    day = addDays(day, -1);
  }
  return day;
}

function brentLtd(year: number, month: number): Date {
  let day = lastDayOfMonth(addMonths(new Date(year, month - 1, 1), -2));
  while (!isBd(day)) day = addDays(day, -1);
  return day;
}

function contractSymbol(prefix: string, deliveryDate: Date): string {
  const monthCode = FUTURES_MONTH_CODES[deliveryDate.getMonth()];
  const year = String(deliveryDate.getFullYear()).slice(-2);
  return `${prefix}${monthCode}${year}`;
}

function nthBdOfMonth(year: number, month: number, n: number): Date {
  let day = new Date(year, month - 1, 1);
  let count = 0;
  while (day.getMonth() === month - 1) {
    if (isBd(day)) count += 1;
    if (count === n) return day;
    day = addDays(day, 1);
  }
  throw new Error(`Month ${year}-${month} has fewer than ${n} business days`);
}

function addBd(date: Date, businessDays: number): Date {
  let day = stripTime(date);
  const step = businessDays >= 0 ? 1 : -1;
  let remaining = Math.abs(businessDays);
  while (remaining > 0) {
    day = addDays(day, step);
    if (isBd(day)) remaining -= 1;
  }
  return day;
}

function isBd(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !usMarketHolidayKeys(date.getFullYear()).has(dateKey(date));
}

function usMarketHolidayKeys(year: number): Set<string> {
  const holidays = [
    observed(new Date(year, 0, 1)),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday(year),
    lastWeekday(year, 4, 1),
    observed(new Date(year, 5, 19)),
    observed(new Date(year, 6, 4)),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observed(new Date(year, 11, 25)),
  ];
  return new Set(holidays.map(dateKey));
}

function observed(date: Date): Date {
  if (date.getDay() === 0) return addDays(date, 1);
  if (date.getDay() === 6) return addDays(date, -1);
  return date;
}

function nthWeekday(
  year: number,
  monthIndex: number,
  weekday: number,
  n: number,
): Date {
  let day = new Date(year, monthIndex, 1);
  while (day.getDay() !== weekday) day = addDays(day, 1);
  return addDays(day, (n - 1) * 7);
}

function lastWeekday(year: number, monthIndex: number, weekday: number): Date {
  let day = lastDayOfMonth(new Date(year, monthIndex, 1));
  while (day.getDay() !== weekday) day = addDays(day, -1);
  return day;
}

function goodFriday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  return addDays(new Date(year, easterMonth - 1, easterDay), -2);
}

function withEtTime(date: Date, time: string): Date {
  const [hours = "0", minutes = "0"] = time.split(":");
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number(hours),
    Number(minutes),
  );
}

function overlaps(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return stripTime(start) <= rangeEnd && stripTime(end) >= rangeStart;
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
