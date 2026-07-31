export type DailyPlanCalendarStatus = "complete" | "partial" | "empty";

export type DailyPlanCalendarDay = {
  date: string;
  status: DailyPlanCalendarStatus;
  total: number;
  completed: number;
  progress: number;
  hasPlan: boolean;
};

export type DailyPlanCalendarResponse = {
  generatedAt: string;
  today: string;
  month: string;
  recentDays: DailyPlanCalendarDay[];
  monthDays: DailyPlanCalendarDay[];
};

export function buildMonthGrid(days: DailyPlanCalendarDay[]): Array<DailyPlanCalendarDay | null> {
  if (days.length === 0) return [];
  const firstWeekday = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const cells: Array<DailyPlanCalendarDay | null> = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...days
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthTitle(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year} 年 ${monthNumber} 月`;
}

export function calendarStatusLabel(day: DailyPlanCalendarDay): string {
  if (day.status === "complete") return "已完成全部任务";
  if (day.status === "partial") return `已完成 ${day.progress}%`;
  if (day.hasPlan) return `已完成 ${day.progress}%`;
  return "无完成记录";
}

export function calendarMarkerKind(
  day: DailyPlanCalendarDay,
  today: string
): "front" | "back" | "none" {
  if (day.date > today) return "none";
  return day.status === "complete" ? "front" : "back";
}

export function makeCalendarFixture(source: DailyPlanCalendarResponse): DailyPlanCalendarResponse {
  const recentDays = source.recentDays.map((day) => ({ ...day }));
  const fixtures: DailyPlanCalendarStatus[] = ["complete", "partial", "empty"];
  recentDays.slice(-3).forEach((day, index) => {
    day.status = fixtures[index];
    day.total = 20;
    day.completed = index === 0 ? 20 : index === 1 ? 10 : 4;
    day.progress = index === 0 ? 100 : index === 1 ? 50 : 20;
    day.hasPlan = true;
  });
  const fixtureByDate = new Map(recentDays.map((day) => [day.date, day]));

  return {
    ...source,
    recentDays,
    monthDays: source.monthDays.map((day) => fixtureByDate.get(day.date) ?? day)
  };
}
