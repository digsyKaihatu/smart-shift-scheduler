import { summarizePattern } from './scheduleUtils';

const escapeCsvCell = (cellData) => {
  if (typeof cellData === 'object' && cellData !== null) {
    if ('type' in cellData && cellData.type === 'シフト休') return 'シフト休';
    if ('type' in cellData && 'hours' in cellData) return `${cellData.type}(${cellData.hours})`;
  }
  const stringData = String(cellData ?? '');
  return stringData.includes(',') ? `"${stringData}"` : stringData;
};

export const downloadScheduleCSV = ({ staff, tasks, schedule, shiftPatterns, taskCountsByDay, days, year, month }) => {
  const dateHeaders = days.map(d => `${d.day}(${d.dayOfWeek})`);
  const headerRow = ['役職', '社員番号', '稼働名前', '基本シフト設定', '提出済', '差戻', '承認済', ...dateHeaders];
  const key = `${year}-${month}`;
  const currentMonthSchedule = schedule[key] || {};

  const staffRows = staff.map(s => {
    const scheduleValues = days.map(d => (currentMonthSchedule[s.id] || {})[d.day] ?? '');
    return [
      s.role,
      s.employeeId,
      s.name,
      // 休憩設定(hasBreakArray)も渡してフォーマットする
      summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray).replace(/\n/g, ' '),
      s.shiftSubmitted?.[key] ? '☑' : '',
      s.shiftRemanded?.[key] ? '☑' : '',
      s.shiftApproved?.[key] ? '☑' : '',
      ...scheduleValues
    ].map(escapeCsvCell).join(',');
  });

  const taskHeader = ['業務', '担当者', '', '', '', '', '', '', ...dateHeaders].map(escapeCsvCell).join(',');

  const taskRows = tasks.map(task => {
    const staffForTask = staff.filter(s => s.possibleTasks.includes(task.id));
    const staffNames = staffForTask.map(s => s.name).join('; ');
    const counts = days.map(d => {
      const count = taskCountsByDay?.[d.day]?.[task.id];
      if (count === 0) return '不足';
      if (count === undefined) return '-';
      return `${count}人`;
    });
    return [task.name, staffNames, '', '', '', '', '', '', ...counts].map(escapeCsvCell).join(',');
  });

  const csvContent = [headerRow.join(','), ...staffRows, '', taskHeader, ...taskRows].join('\n');
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `shift_schedule_${year}_${month}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
