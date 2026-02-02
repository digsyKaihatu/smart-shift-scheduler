import { summarizePattern } from './scheduleUtils';
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

export const downloadScheduleCSV = (staffList, scheduleData, shiftPatterns, year, month) => {
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
      // 日付キーの生成 (YYYY-MM-DD)
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      // スケジュールデータの取得
      const daySchedule = scheduleData[dateKey] || {};
      const val = daySchedule[staff.id];
      
      // CSV用の変換を適用 (formatForCsvを使用)
      const formattedVal = formatForCsv(val || '');
      
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
