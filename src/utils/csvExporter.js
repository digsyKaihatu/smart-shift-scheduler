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

export const downloadScheduleCSV = (staffList, scheduleData, shiftPatterns, year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  
  // ヘッダー行の作成
  const headerRow = ['社員番号', '氏名', '基本シフト'];
  for (let d = 1; d <= daysInMonth; d++) {
    headerRow.push(`${d}日`);
  }
  
  const csvRows = [headerRow.map(escapeCsvCell).join(',')];

  // staffListの安全性チェック
  // 配列でない場合は空配列として扱う
  const safeStaffList = Array.isArray(staffList) ? staffList : [];
  
  // shiftPatternsの安全性チェック
  const safeShiftPatterns = Array.isArray(shiftPatterns) ? shiftPatterns : [];

  // データ行の作成
  safeStaffList.forEach(staff => {
    // 基本シフトパターン名の取得
    // staff.defaultShift がない場合の対策
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
      // scheduleDataの構造: { "YYYY-MM-DD": { "staffId": "value" } }
      const daySchedule = scheduleData[dateKey] || {};
      const val = daySchedule[staff.id];
      
      // 表示形式に合わせて変換 (formatValueを使用)
      const formattedVal = formatValue(val || '');
      
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
