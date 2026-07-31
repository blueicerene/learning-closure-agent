import assert from "node:assert/strict";
import {
  buildMonthGrid,
  calendarMarkerKind,
  calendarStatusLabel,
  formatMonthTitle,
  makeCalendarFixture,
  shiftMonth,
  type DailyPlanCalendarDay,
  type DailyPlanCalendarResponse
} from "../dailyPlanCalendar.js";
import { refreshAfterQuizAnswer } from "../quizAnswerRefresh.js";

const monthDays: DailyPlanCalendarDay[] = Array.from({ length: 31 }, (_, index) => ({
  date: `2026-07-${String(index + 1).padStart(2, "0")}`,
  status: "empty",
  total: 0,
  completed: 0,
  progress: 0,
  hasPlan: false
}));
const response: DailyPlanCalendarResponse = {
  generatedAt: "2026-07-26T12:00:00.000Z",
  today: "2026-07-26",
  month: "2026-07",
  recentDays: monthDays.slice(19, 26),
  monthDays
};

const fixture = makeCalendarFixture(response);
assert.deepEqual(fixture.recentDays.slice(-3).map((day) => day.status), ["complete", "partial", "empty"]);
assert.deepEqual(
  fixture.recentDays.slice(-3).map((day) => calendarMarkerKind(day, fixture.today)),
  ["front", "back", "back"]
);
assert.equal(calendarMarkerKind(monthDays.at(-1)!, response.today), "none");
assert.equal(calendarStatusLabel(fixture.recentDays.at(-3)!), "已完成全部任务");
assert.equal(calendarStatusLabel(fixture.recentDays.at(-2)!), "已完成 50%");
assert.equal(buildMonthGrid(monthDays).length, 35);
assert.equal(buildMonthGrid(monthDays)[2]?.date, "2026-07-01");
assert.equal(shiftMonth("2026-01", -1), "2025-12");
assert.equal(shiftMonth("2026-12", 1), "2027-01");
assert.equal(formatMonthTitle("2026-07"), "2026 年 7 月");

let learningStatus = { dailyPlanTotal: 20, dailyPlanCompleted: 19 };
let refreshedCalendar = makeCalendarFixture(response);
const selectedMonth = "2026-07";
const loaderCalls: string[] = [];

await refreshAfterQuizAnswer({
  month: selectedMonth,
  loadItems: async () => {
    loaderCalls.push("items");
  },
  loadLearningStatus: async () => {
    loaderCalls.push("learning-status");
    learningStatus = { dailyPlanTotal: 20, dailyPlanCompleted: 20 };
  },
  loadCalendar: async (month) => {
    loaderCalls.push(`calendar:${month}`);
    const completeDay: DailyPlanCalendarDay = {
      date: response.today,
      status: "complete",
      total: 20,
      completed: 20,
      progress: 100,
      hasPlan: true
    };
    refreshedCalendar = {
      ...response,
      recentDays: response.recentDays.map((day) => day.date === response.today ? completeDay : day),
      monthDays: response.monthDays.map((day) => day.date === response.today ? completeDay : day)
    };
  },
  loadFocusAvailability: async () => {
    loaderCalls.push("focus-availability");
  }
});

const refreshedRecentToday = refreshedCalendar.recentDays.find((day) => day.date === response.today);
const refreshedMonthToday = refreshedCalendar.monthDays.find((day) => day.date === response.today);
assert.deepEqual(loaderCalls.sort(), ["calendar:2026-07", "focus-availability", "items", "learning-status"]);
assert.deepEqual(learningStatus, { dailyPlanTotal: 20, dailyPlanCompleted: 20 });
assert.ok(refreshedRecentToday);
assert.ok(refreshedMonthToday);
assert.equal(refreshedRecentToday.status, "complete");
assert.equal(refreshedMonthToday.status, "complete");
assert.equal(calendarMarkerKind(refreshedRecentToday, refreshedCalendar.today), "front");
assert.equal(calendarMarkerKind(refreshedMonthToday, refreshedCalendar.today), "front");
assert.deepEqual(refreshedRecentToday, refreshedMonthToday);

console.log("PASS web daily-plan calendar fixture: 7-day/month markers and final-answer refresh");
