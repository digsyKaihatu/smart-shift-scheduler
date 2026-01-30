// --- Helper Functions (date-fnsの代替) ---

/**
 * 指定された年・月の第n月曜日の日付を取得するヘルパー関数
 */
const getNthMonday = (year, month, n) => {
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); // 0:Sun, 1:Mon, ...
  let day = 1;
  if (dayOfWeek <= 1) {
    day += 1 - dayOfWeek;
  } else {
    day += 8 - dayOfWeek;
  }
  return day + (n - 1) * 7;
};

/**
 * 日本の祝日を取得する
 * (固定祝日、ハッピーマンデー、春分/秋分の日、振替休日対応)
 */
export const getJapaneseHolidays = (year, month) => {
  const holidays = new Set();

  // 1. 固定の祝日
  const fixedHolidays = {
    1: [1], // 元日
    2: [11], // 建国記念の日
    4: [29], // 昭和の日
    5: [3, 4, 5], // 憲法記念日, みどりの日, こどもの日
    8: [11], // 山の日
    11: [3, 23], // 文化の日, 勤労感謝の日
  };
  
  // 天皇誕生日 (2020年以降: 2/23, 2018年以前: 12/23)
  if (year >= 2020 && month === 2) holidays.add(23);
  if (year <= 2018 && month === 12) holidays.add(23);

  if (fixedHolidays[month]) {
    fixedHolidays[month].forEach(d => holidays.add(d));
  }

  // 2. ハッピーマンデー (移動祝日)
  if (month === 1) holidays.add(getNthMonday(year, 1, 2)); // 成人の日
  if (month === 7) holidays.add(getNthMonday(year, 7, 3)); // 海の日
  if (month === 9) holidays.add(getNthMonday(year, 9, 3)); // 敬老の日
  if (month === 10) holidays.add(getNthMonday(year, 10, 2)); // スポーツの日

  // 3. 春分の日・秋分の日 (簡易計算式 1980-2099対応)
  if (month === 3) {
    const day = Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    holidays.add(day);
  }
  if (month === 9) {
    const day = Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    holidays.add(day);
  }

  // 一旦リスト化してソート
  let holidayList = Array.from(holidays).sort((a, b) => a - b);
  const daysInMonth = new Date(year, month, 0).getDate();
  const resultHolidays = new Set(holidayList);

  // 4. 振替休日 (祝日が日曜の場合、その日以降の直近の平日を休日にする)
  holidayList.forEach(day => {
    const date = new Date(year, month - 1, day);
    if (date.getDay() === 0) { // 日曜の場合
      let nextDay = day + 1;
      while (nextDay <= daysInMonth) {
        // 次の日も元々の祝日リストに含まれていれば、さらにその次へ
        if (!holidayList.includes(nextDay)) {
           resultHolidays.add(nextDay);
           break;
        }
        nextDay++;
      }
    }
  });

  // 5. 国民の休日 (祝日に挟まれた平日)
  // 例: 9月の敬老の日(月)と秋分の日(水)の間の火曜日など
  if (month === 9) {
      // 9月のみ発生する可能性があるため簡易チェック
      const sorted = Array.from(resultHolidays).sort((a, b) => a - b);
      for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i + 1] - sorted[i] === 2) {
              const middleDay = sorted[i] + 1;
              const date = new Date(year, month - 1, middleDay);
              // 祝日と祝日の間が平日であれば国民の休日
              if (date.getDay() > 0 && date.getDay() < 6) {
                  resultHolidays.add(middleDay);
              }
          }
      }
  }

  return Array.from(resultHolidays).sort((a, b) => a - b);
};

/**
 * 閲覧モードでの表記を短縮するヘルパー関数
 */
export const formatValue = (value) => {
  const mapping = {
    'シフト休': '休',
    '欠勤': '欠',
    '通休': '通',
    '有休': '有',
    '遅刻': '遅',
    '早退': '早'
  };

  if (typeof value === 'number') {
    return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  }

  // オブジェクト形式（時間単位の休暇など）の場合
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    // 完全一致での置換
    if (mapping[value.type]) {
      displayType = mapping[value.type];
    } else {
      // 部分一致（午前有休 -> 午前有 など）の置換
      Object.entries(mapping).forEach(([full, short]) => {
        displayType = displayType.replace(full, short);
      });
    }

    if ('locked' in value) {
      return displayType;
    }
    return `${displayType}(${value.hours})`;
  }

  // 文字列の場合
  if (typeof value === 'string') {
    return mapping[value] || value;
  }

  return value;
};

/**
 * Dateオブジェクトを YYYY-MM-DD 形式の文字列に変換
 */
export const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Dateオブジェクトから日本語の曜日を取得
 */
export const getDayOfWeekStr = (date) => {
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
};

// 土日判定 (Native)
export const isWeekend = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
};

// 祝日判定 (getJapaneseHolidaysを使用するように修正)
export const isHoliday = (date) => {
  if (!date) return false;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const holidays = getJapaneseHolidays(year, month);
  return holidays.includes(day);
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

// 初期スケジュールデータの生成
export const generateInitialSchedule = (year, month) => {
  const schedule = {};
  const days = getDaysInMonthArray(year, month);
  days.forEach((day) => {
    const dateStr = formatDate(day);
    schedule[dateStr] = {};
  });
  return schedule;
};

// MainContent.jsx等で使用される関数（generateInitialScheduleのエイリアス）
export const generateScheduleForMonth = generateInitialSchedule;

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

// シフトパターンの概要を取得（CSVエクスポートなどで使用）
export const summarizePattern = (pattern, patterns, hasBreakArray) => {
  // 配列でない場合（予期しない呼び出し）は未設定を返す
  if (!pattern || !Array.isArray(pattern)) return '未設定';

  // 全て同じパターンかチェック
  const firstId = pattern[0];
  const isUniform = pattern.every(id => id === firstId);

  if (isUniform) {
    if (firstId === 'シフト休') {
        return '月〜金: シフト休';
    }
    const p = patterns.find(x => x.id === firstId);
    if (p) {
        // 名前だけでなく時間も含めて返す (例: "A勤務 (09:00-18:00)")
        return `${p.name} (${p.startTime}-${p.endTime})`;
    }
  }
  // 曜日ごとに異なる場合
  return 'カスタム';
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
