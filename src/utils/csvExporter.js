import { summarizePattern, generateScheduleForMonth } from './scheduleUtils';
import { formatValue } from './dateUtils';

const escapeCsvCell = (cellData) => {
  if (cellData === null || cellData === undefined) {
    return '';
  }
  const stringData = String(cellData);
  // ダブルクォートがあればエスケープし、全体をダブルクォートで囲む
  if (stringData.includes('"') || stringData.includes(',') || stringData.includes('\n')) {
    return `"${stringData.replace(/"/g, '""')}"`;
  }
  return stringData;
};

// CSV出力用に値を整形する関数
const formatForCsv = (value) => {
  // まず標準のフォーマット関数を通す
  let formatted = formatValue(value);

  // 文字列の場合、特定のキーワードを短縮形に置換する
  // (formatValueは完全一致のみの変換やオブジェクト処理を行うが、
  //  "午前通休"のような文字列の部分一致置換をここで行う)
  if (typeof formatted === 'string') {
    const replacements = {
      '通休': '通',
      '有休': '有',
      'シフト休': '休',
      '欠勤': '欠',
      '遅刻': '遅',
      '早退': '早'
    };

    Object.entries(replacements).forEach(([full, short]) => {
      // split/joinを使って全ての出現箇所を置換
      formatted = formatted.split(full).join(short);
    });
  }

  return formatted;
};

/**
 * CSVダウンロード関数
 * @param {Array} staffList - スタッフリスト
 * @param {Object} scheduleData - スケジュールデータ
 * @param {Array|Number} arg3 - shiftPatterns または year (互換性対応)
 * @param {Number} arg4 - year または month (互換性対応)
 * @param {Number} [arg5] - month (arg3がshiftPatternsの場合)
 */
export const downloadScheduleCSV = (staffList, scheduleData, arg3, arg4, arg5) => {
  let shiftPatterns = [];
  let year, month;

  // 引数の互換性対応
  if (Array.isArray(arg3)) {
      // 新仕様: (staffList, scheduleData, shiftPatterns, year, month)
      shiftPatterns = arg3;
      year = arg4;
      month = arg5;
  } else {
      // 旧仕様: (staffList, scheduleData, year, month)
      shiftPatterns = []; 
      year = arg3;
      month = arg4;
  }

  // year, month の安全性チェック
  if (!year || !month) {
      console.error('CSV export failed: year or month is missing/undefined.', { year, month });
      alert('CSV出力エラー: 年月が正しく指定されていません。');
      return;
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  
  // ヘッダー行の作成
  const headerRow = ['社員番号', '氏名', '基本シフト'];
  for (let d = 1; d <= daysInMonth; d++) {
    headerRow.push(`${d}日`);
  }
  
  const csvRows = [headerRow.map(escapeCsvCell).join(',')];

  // staffListの安全性チェック
  const safeStaffList = Array.isArray(staffList) ? staffList : [];
  
  // shiftPatternsの安全性チェック
  const safeShiftPatterns = Array.isArray(shiftPatterns) ? shiftPatterns : [];

  // 基本シフトに基づいたベーススケジュールを生成
  const baseSchedule = generateScheduleForMonth(year, month, safeStaffList, safeShiftPatterns);

  // データ取得用のキーを生成 (YYYY-M 形式)
  // MainContent.jsxなどの保存ロジックと形式を合わせる必要があります
  const monthKey = `${year}-${month}`;
  const currentMonthData = scheduleData[monthKey] || {};

  // データ行の作成
  safeStaffList.forEach(staff => {
    // 基本シフトパターン名の取得
    const defaultShift = staff.defaultShift || {};
    
    const patternName = summarizePattern(
        defaultShift.pattern, 
        safeShiftPatterns, 
        defaultShift.hasBreakArray
    );

    const row = [
      staff.employeeId || '',
      staff.name,
      patternName
    ];

    for (let d = 1; d <= daysInMonth; d++) {
      // 1. 手入力データの取得
      // scheduleData -> monthKey -> staffId -> day (数値) の順でアクセス
      const staffMonthData = currentMonthData[staff.id] || {};
      const userVal = staffMonthData[d];

      // 2. 基本パターンデータの取得
      const baseVal = baseSchedule[staff.id]?.[d];

      // 3. マージ: 手入力があればそれを優先 (空文字も有効な入力として扱う)
      const finalVal = (userVal !== undefined) 
                       ? userVal 
                       : baseVal;
      
      // CSV用の変換を適用
      const formattedVal = formatForCsv(finalVal || '');
      
      row.push(formattedVal);
    }
    csvRows.push(row.map(escapeCsvCell).join(','));
  });

  // BOM付与してダウンロード
  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `shift_schedule_${year}_${month}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
