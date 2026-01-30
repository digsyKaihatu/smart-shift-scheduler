import { HOLIDAYS } from '../constants/initialData';

// --- Helper Functions (date-fnsの代替) ---

// 日付を yyyy-MM-dd 形式の文字列に変換
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 土日判定 (Native)
export const isWeekend = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
};

// 祝日判定
export const isHoliday = (date) => {
  if (!date) return false;
  const dateStr = formatDate(date);
  return Object.prototype.hasOwnProperty.call(HOLIDAYS, dateStr);
};

// 土日祝判定
export const isHolidayOrWeekend = (date) => {
  return isWeekend(date) || isHoliday(date);
};

// 月の日付配列を取得 (Native)
export const getDaysInMonthArray = (year, month) => {
  const days = [];
  // month argument is 1-based (1=January), Date constructor takes 0-based month for the second argument
  const date = new Date(year, month - 1, 1);
  
  // 月が変わるまでループ
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

// 時間計算（休憩時間を考慮）
export const calculateHours = (startTime, endTime, breakTime = '01:00') => {
  if (!startTime || !endTime) return 0;

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const [breakH, breakM] = breakTime.split(':').map(Number);

  let startMin = startH * 60 + startM;
  let endMin = endH * 60 + endM;
  const breakMin = breakH * 60 + breakM;

  if (endMin < startMin) {
    endMin += 24 * 60; // 日またぎ対応
  }

  const durationMin = endMin - startMin - breakMin;
  return Math.max(0, durationMin / 60);
};

/**
 * シフトパターンを判定する
 * 修正: 休暇系ステータス（有給、通院など）がある場合は、パターン不一致とせず許容する
 */
export const identifyShiftPattern = (monthlyShifts, patterns, year, month) => {
  if (!monthlyShifts || !patterns) return null;

  const days = getDaysInMonthArray(year, month);
  
  // 休暇として許容するキーワード
  const ALLOWED_EXCEPTIONS = ['有給', '有休', '通院', '半休', '特休', '慶弔', '欠勤', '忌引', '産休', '育休', '介護'];

  // 各パターンについて適合度をチェック
  for (const [patternId, pattern] of Object.entries(patterns)) {
    let isMatch = true;

    for (const date of days) {
      const dateKey = formatDate(date);
      const shift = monthlyShifts[dateKey];
      const isOffDay = isHolidayOrWeekend(date);

      if (isOffDay) {
        // 土日祝の場合
        // シフトが入っていない、または「公休」「休」などの場合はOK
        // パターンとしては「何もない」ことが期待値だが、明示的な休日も許容
        if (shift && shift.trim() !== '' && shift !== '公休' && shift !== '休' && !ALLOWED_EXCEPTIONS.some(ex => shift.includes(ex))) {
          // 土日祝に勤務時間が入っている場合は不一致
           // ただし、時間の形式（00:00-00:00）でなければ許容（メモ書きなど）
           if (/\d{1,2}:\d{2}/.test(shift)) {
             isMatch = false;
             break;
           }
        }
      } else {
        // 平日の場合
        if (!shift) {
          // 平日にシフトが空の場合は不一致
          isMatch = false;
          break;
        }

        // 休暇系キーワードが含まれている場合は、勤務時間が一致していなくてもOKとする
        if (ALLOWED_EXCEPTIONS.some(ex => shift.includes(ex))) {
          continue;
        }

        // 通常の勤務チェック
        const patternTime = `${pattern.start}-${pattern.end}`;
        // 時間が完全に一致するか、あるいは入力された文字列に時間が含まれているか
        if (shift !== patternTime && !shift.includes(patternTime)) {
          isMatch = false;
          break;
        }
      }
    }

    if (isMatch) {
      return patternId; // 一致するパターンIDを返す
    }
  }

  return null; // 一致なし
};

// データのCSVエクスポート用フォーマット
export const formatShiftDataForExport = (staffList, scheduleData, year, month) => {
  // 実装は省略（csvExporter.js側で処理するため、ここはヘルパー的に使う想定）
  return [];
};

// カレンダー表示用の日付ごとのクラス名取得
export const getDateCellClass = (date) => {
  if (isHoliday(date)) return 'bg-red-50 text-red-600';
  if (isWeekend(date)) {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 0) return 'bg-red-50 text-red-600'; // 日曜
    if (day === 6) return 'bg-blue-50 text-blue-600'; // 土曜
  }
  return '';
};
