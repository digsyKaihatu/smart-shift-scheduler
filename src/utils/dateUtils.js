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
