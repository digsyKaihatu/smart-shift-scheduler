import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// =============================================================================
// 1. Icons & Utilities
// =============================================================================

const DeleteIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: '20px', minWidth: '20px' }} className="text-slate-400 group-hover:text-red-600 transition-colors pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
    </svg>
);

const SetHolidayIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
);

const UnlockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v3m-6 2h12a2 2 0 002-2v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7a2 2 0 002 2z" /></svg>
);

const ChevronDownIcon = () => (
    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
    </svg>
);

const ChevronLeft = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const ChevronRight = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const Trash2 = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const XIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const getJapaneseHolidays = (year, month) => {
    // 簡易的な祝日ロジック
    // ※実運用では内閣府のCSVなどを利用するか、祝日ライブラリを使用します。
    // ここではデモ用にいくつかの祝日を固定で定義します。
    const holidays = [];
    if (month === 1) holidays.push(1, 13); // 元日, 成人の日(2025)
    if (month === 2) holidays.push(11, 23); // 建国記念の日, 天皇誕生日
    if (month === 3) holidays.push(20); // 春分の日
    if (month === 4) holidays.push(29); // 昭和の日
    if (month === 5) holidays.push(3, 4, 5, 6); // 憲法記念日, みどりの日, こどもの日, 振替休日
    if (month === 7) holidays.push(21); // 海の日
    if (month === 8) holidays.push(11); // 山の日
    if (month === 9) holidays.push(15, 23); // 敬老の日, 秋分の日
    if (month === 10) holidays.push(13); // スポーツの日
    if (month === 11) holidays.push(3, 23); // 文化の日, 勤労感謝の日
    // ... 他の月も必要に応じて追加
    return holidays;
};

const formatValue = (value) => {
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

  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    if (mapping[value.type]) {
      displayType = mapping[value.type];
    } else {
      Object.entries(mapping).forEach(([full, short]) => {
        displayType = displayType.replace(full, short);
      });
    }
    if ('locked' in value) return displayType;
    return `${displayType}(${value.hours})`;
  }

  if (typeof value === 'string') {
    return mapping[value] || value;
  }
  return value;
};

const summarizePattern = (pattern, patterns, hasBreakArray) => {
    if (!pattern || pattern.length !== 5) return '未設定';
    const DAY_NAMES = ['月', '火', '水', '木', '金'];
    const getBreak = (i) => Array.isArray(hasBreakArray) ? hasBreakArray[i] : true;

    const firstId = pattern[0];
    const firstBreak = getBreak(0);
    const isUniform = pattern.every((id, i) => id === firstId && getBreak(i) === firstBreak);

    if (isUniform) {
        if (firstId === 'シフト休') return '月〜金: シフト休';
        const p = patterns.find(x => x.id === firstId);
        if (p) {
            const breakStr = firstBreak ? '休憩あり' : '休憩なし';
            return `月〜金 ${p.startTime}～${p.endTime} ${breakStr}`;
        }
    }

    const lines = pattern.map((pId, index) => {
        const isBreak = getBreak(index);
        const breakLabel = isBreak ? "(休憩あり)" : "(休憩なし)";
        if (pId === 'シフト休') return `${DAY_NAMES[index]}:休`;
        const p = patterns.find(x => x.id === pId);
        if (!p) return `${DAY_NAMES[index]}:?`;
        return `${DAY_NAMES[index]}:${p.name}${breakLabel}`;
    });

    return `${lines.slice(0, 3).join(' ')}\n${lines.slice(3).join(' ')}`;
};

const escapeCsvCell = (cellData) => {
  if (typeof cellData === 'object' && cellData !== null) {
    if ('type' in cellData && cellData.type === 'シフト休') return 'シフト休';
    if ('type' in cellData && 'hours' in cellData) return `${cellData.type}(${cellData.hours})`;
  }
  const stringData = String(cellData ?? '');
  return stringData.includes(',') ? `"${stringData}"` : stringData;
};

const downloadScheduleCSV = ({ staff, tasks, schedule, shiftPatterns, taskCountsByDay, days, year, month }) => {
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

const getColorForName = (name) => {
  const colors = [
    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
    { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
    { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
    { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// =============================================================================
// 2. Initial Data & Generators
// =============================================================================

const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'B', name: 'B', startTime: '9:00', endTime: '17:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'C', name: 'C', startTime: '9:00', endTime: '17:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  // ... 他のパターンも必要に応じて追加
];

const initialStaffData = [
  {
    id: 'admin',
    name: '管理者',
    role: '管理者',
    employeeId: '000',
    email: 'admin@example.com',
    chatUserId: '',
    possibleTasks: ['t1', 't2'],
    defaultShift: { pattern: ['I', 'I', 'I', 'I', 'I'], hasBreakArray: [true, true, true, true, true] },
    shiftSubmitted: {},
    shiftRemanded: {},
    shiftApproved: {}
  }
];

const initialTasks = [
  { id: 't1', name: '業務A', requiredPersonnel: 3 },
  { id: 't2', name: '業務B', requiredPersonnel: 2 }
];

const initialAdminConfig = {
    adminEmails: 'admin@example.com',
    submissionNotificationIds: ''
};

// 自動シフト生成ロジック
const generateScheduleForMonth = (year, month, staffData, shiftPatternsData) => {
    const scheduleForMonth = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = getJapaneseHolidays(year, month);

    staffData.forEach(staffMember => {
        const staffId = staffMember.id;
        scheduleForMonth[staffId] = {};
        const defaultPattern = staffMember.defaultShift?.pattern;
        const hasBreakArray = staffMember.defaultShift?.hasBreakArray || [true, true, true, true, true];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay(); // Sunday: 0, Monday: 1, ..., Saturday: 6
            const isHoliday = monthHolidays.includes(day);

            if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday) {
                scheduleForMonth[staffId][day] = 'シフト休';
            } else {
                // It's a weekday
                const patternIndex = dayOfWeek - 1; // Monday (1) -> 0
                if (defaultPattern && patternIndex >= 0 && patternIndex < defaultPattern.length) {
                    const patternId = defaultPattern[patternIndex];
                    if (patternId === 'シフト休') {
                        scheduleForMonth[staffId][day] = 'シフト休';
                    } else {
                        const patternDetails = shiftPatternsData.find(p => p.id === patternId);
                        if (patternDetails) {
                             // 休憩あり/なしで実働時間を分岐
                             // ただし、単純化のため、パターンに定義された workHours をそのまま使う
                             // もし休憩なしなら +1h するロジックを入れる場合はここで行う
                             const isBreak = hasBreakArray[patternIndex];
                             scheduleForMonth[staffId][day] = isBreak ? patternDetails.workHours : (patternDetails.workHours + patternDetails.breakHours);
                        } else {
                            scheduleForMonth[staffId][day] = '';
                        }
                    }
                } else {
                    scheduleForMonth[staffId][day] = ''; 
                }
            }
        }
    });

    return scheduleForMonth;
};

// =============================================================================
// 3. Components
// =============================================================================

const LoadingScreen = ({ message }) => (
    <div className="fixed inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center z-[100]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#F4B896]"></div>
        <p className="mt-4 text-lg font-semibold text-slate-700">{message}</p>
    </div>
);

const HelpGuideModal = ({ onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h2 className="text-lg font-bold text-slate-800">使い方ガイド</h2>
          <button onClick={onClose}><XIcon size={24} /></button>
        </header>
        <main className="p-6 overflow-y-auto space-y-6">
            <p>1. シフト表のセルをクリックして稼働時間やステータスを入力します。</p>
            <p>2. 「基本シフト設定」でデフォルトの勤務パターンを設定し、「適用」ボタンで一括反映できます。</p>
            <p>3. データは自動的にブラウザに保存されます。</p>
        </main>
      </div>
    </div>
);

const ConfirmDeleteModal = ({ itemType, itemName, onConfirm, onCancel }) => (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">{itemType}の削除</h2>
        </header>
        <main className="p-6 text-center">
          <p className="text-sm text-slate-700">「{itemName}」を削除しますか？</p>
        </main>
        <footer className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-lg">
          <button onClick={onCancel} className="px-4 py-2 text-sm bg-slate-200 rounded-md">キャンセル</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md">削除</button>
        </footer>
      </div>
    </div>
);

// --- EditableCells ---
const EditableCell = ({ value, onUpdate, borderClass, disabled = false, isAdmin = false, isToday = false }) => {
  const [mode, setMode] = useState('view');
  const [inputValue, setInputValue] = useState('');
  const [editingSpecialShift, setEditingSpecialShift] = useState(null);
  const inputRef = useRef(null);

  const isLocked = typeof value === 'object' && value !== null && 'locked' in value && value.locked;
  const isEffectivelyDisabled = disabled || (isLocked && !isAdmin);

  useEffect(() => {
    if (mode === 'input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  const commitInput = () => {
    const hours = parseFloat(inputValue);
    if (!isNaN(hours) && hours >= 0) {
      onUpdate(editingSpecialShift ? { type: editingSpecialShift, hours } : hours);
    }
    setMode('view');
    setEditingSpecialShift(null);
  };

  const handleSelectChange = (e) => {
    const selected = e.target.value;
    const specialShiftOptions = ['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'];

    if (specialShiftOptions.includes(selected)) {
        const currentHours = (typeof value === 'object' && value?.type === selected) ? value.hours : 4.0;
        setEditingSpecialShift(selected);
        setInputValue(String(currentHours));
        setMode('input');
    } else if (selected === '稼働時間入力') {
        setEditingSpecialShift(null);
        setInputValue(String(typeof value === 'number' ? value : 8.0));
        setMode('input');
    } else {
        onUpdate(selected);
        setMode('view');
    }
  };

  const getBackgroundColor = () => {
    const hoverClass = isEffectivelyDisabled ? '' : 'hover:bg-opacity-80';
    const todayClass = isToday && value === '' ? 'bg-yellow-50' : '';
    if (typeof value === 'number' && value > 0) return `bg-green-100 ${hoverClass}`;
    if (typeof value === 'object' && value !== null && 'type' in value) {
        if (value.type.includes('有休')) return `bg-yellow-100 ${hoverClass}`;
        return `bg-slate-200 ${hoverClass}`;
    }
    switch(value) {
      case '有休': return `bg-yellow-100 ${hoverClass}`;
      case '通休': return `bg-blue-100 ${hoverClass}`;
      case 'シフト休': return `bg-slate-200 ${hoverClass}`;
      case '欠勤': return `bg-red-100 ${hoverClass}`;
      default: return `${todayClass || 'bg-white'} ${isEffectivelyDisabled ? '' : 'hover:bg-slate-50'}`;
    }
  };
  
  const baseClasses = `border-b border-r ${borderClass} text-center text-xs h-10 flex items-center justify-center w-[75px] min-w-[75px] max-w-[75px] box-border`;

  if (mode === 'view') {
    return (
      <div onClick={() => !isEffectivelyDisabled && setMode('select')} className={`relative ${baseClasses} transition-colors duration-150 ${getBackgroundColor()} ${isEffectivelyDisabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer'}`}>
        <span className="truncate w-full px-0.5">{formatValue(value)}</span>
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-white relative`}>
      {mode === 'select' ? (
        <select
          autoFocus
          onChange={handleSelectChange}
          onBlur={() => setMode('view')}
          className="absolute inset-0 w-full h-full opacity-100 bg-transparent text-center text-xs cursor-pointer appearance-none outline-none focus:ring-2 focus:ring-sky-500"
          defaultValue=""
        >
          <option value="" disabled hidden>選択...</option>
          <option value="稼働時間入力">稼働時間入力</option>
          <optgroup label="ステータス">
              <option value="有休">有休</option>
              <option value="シフト休">シフト休</option>
              <option value="通休">通院休暇</option>
              <option value="欠勤">欠勤</option>
          </optgroup>
          <optgroup label="時間単位">
              {['遅刻', '早退', '午前有休', '午後有休', '午前休', '午後休', '午前通休', '午後通休'].map(opt => (
                  <option key={opt} value={opt}>{opt.replace('通休', '通院休暇')}</option>
              ))}
          </optgroup>
          <option value="">(クリア)</option>
        </select>
      ) : (
        <input
            ref={inputRef}
            type="number"
            step="0.5"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitInput}
            onKeyDown={(e) => e.key === 'Enter' && commitInput()}
            className="absolute inset-0 w-full h-full p-0 m-0 bg-transparent text-center text-xs outline-none"
        />
      )}
    </div>
  );
};

const EditableStaffInfoCell = ({ value, onUpdate, className, disabled = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => { setCurrentValue(value); }, [value]);
  const handleBlur = () => {
    if (currentValue.trim() !== value) onUpdate(currentValue.trim());
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={`h-10 text-[11px] border-b border-r border-slate-300 flex items-center px-1.5 bg-white ${className}`}>
        <input
          type="text"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
          autoFocus
          className="w-full h-full bg-transparent outline-none"
        />
      </div>
    );
  }

  return (
    <div onClick={() => !disabled && setIsEditing(true)} className={`h-10 text-[11px] border-b border-r border-slate-300 flex items-center px-1.5 overflow-hidden bg-white transition-colors ${disabled ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-slate-50'} ${className}`}>
        <div className="font-semibold truncate w-full">{value}</div>
    </div>
  );
};

// --- ShiftPatternEditor ---
const ShiftPatternEditor = ({ pattern, hasBreakArray, patterns, onApply, summary, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editedPattern, setEditedPattern] = useState(pattern || Array(5).fill('シフト休'));
  const [editedHasBreak, setEditedHasBreak] = useState(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
  
  const filteredPatterns = patterns.filter(p => p.startTime !== '9:00' && p.startTime !== '09:00');
  const [bulkPatternId, setBulkPatternId] = useState(filteredPatterns[0]?.id || 'シフト休');
  const [bulkBreak, setBulkBreak] = useState(true);

  useEffect(() => { 
    if (isOpen) {
        setEditedPattern(pattern || Array(5).fill('シフト休')); 
        setEditedHasBreak(Array.isArray(hasBreakArray) ? [...hasBreakArray] : Array(5).fill(true));
    }
  }, [isOpen, pattern, hasBreakArray]);

  const editorPopup = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="w-full max-w-md bg-white rounded-md shadow-lg border border-slate-200 p-4" onMouseDown={(e) => e.stopPropagation()}>
            <h4 className="font-bold text-md mb-4 text-slate-800 border-b pb-2">基本シフトパターン編集</h4>
            <div className="mb-4 p-3 bg-orange-50 rounded-md border border-orange-100 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="font-bold text-xs text-orange-800">月〜金 一括設定</label>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="bulk-break" checked={bulkBreak} onChange={(e) => setBulkBreak(e.target.checked)} className="h-3.5 w-3.5 text-orange-600 rounded" />
                        <label htmlFor="bulk-break" className="text-[10px] font-bold text-orange-700">休憩あり</label>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <select value={bulkPatternId} onChange={(e) => setBulkPatternId(e.target.value)} className="flex-grow text-xs p-1.5 border border-slate-300 rounded bg-white">
                        <option value="シフト休">シフト休</option>
                        {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                    </select>
                    <button onClick={() => { setEditedPattern(Array(5).fill(bulkPatternId)); setEditedHasBreak(Array(5).fill(bulkBreak)); }} className="text-xs px-3 py-1.5 bg-[#F4B896] text-white rounded font-bold hover:bg-[#E8A680]">適用</button>
                </div>
            </div>
            <div className="space-y-2">
                {['月', '火', '水', '木', '金'].map((dayName, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-1 font-bold text-xs text-slate-600">{dayName}</label>
                        <div className="col-span-8">
                            <select value={editedPattern[index]} onChange={(e) => { const np = [...editedPattern]; np[index] = e.target.value; setEditedPattern(np); }} className="w-full text-xs p-1.5 border border-slate-300 rounded-md bg-white">
                                <option value="シフト休">シフト休</option>
                                {filteredPatterns.map(p => <option key={p.id} value={p.id}>{`${p.name} (${p.startTime}-${p.endTime})`}</option>)}
                            </select>
                        </div>
                        <div className="col-span-3 flex items-center gap-1 justify-end">
                            <input type="checkbox" id={`break-${index}`} checked={editedHasBreak[index]} onChange={() => { const nb = [...editedHasBreak]; nb[index] = !nb[index]; setEditedHasBreak(nb); }} disabled={editedPattern[index] === 'シフト休'} className="h-3.5 w-3.5 text-sky-600 rounded" />
                            <label htmlFor={`break-${index}`} className="text-[10px] whitespace-nowrap cursor-pointer">休憩</label>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
                <button onClick={() => setIsOpen(false)} className="text-xs px-4 py-2 bg-slate-100 rounded font-bold">キャンセル</button>
                <button onClick={() => { onApply(editedPattern, editedHasBreak); setIsOpen(false); }} className="text-xs px-4 py-2 bg-[#F4B896] text-white rounded font-bold shadow-sm hover:bg-[#E8A680]">適用</button>
            </div>
        </div>
    </div>, document.body
  ) : null;

  return (
    <div className="h-full w-full">
      <button onClick={() => !disabled && setIsOpen(true)} className={`w-full h-full flex items-center justify-start text-left p-1 rounded transition-colors ${disabled ? 'cursor-not-allowed' : 'hover:bg-slate-200'}`} disabled={disabled}>
        <div className="text-[10px] leading-tight font-semibold whitespace-pre-wrap text-slate-700 overflow-hidden">{summary}</div>
      </button>
      {editorPopup}
    </div>
  );
};

// --- ShiftSchedule ---
const ShiftSchedule = ({ 
    currentUser, isAdmin, schedule, staff = [], days = [], holidays = [], shiftPatterns = [], year, month, 
    onUpdateSchedule, onDeleteStaff, onUpdateStaffInfo, onApplyStaffPattern, onToggleShiftSubmitted, onToggleShiftApproved, onToggleShiftRemanded, onSetDayAsHolidayForAll 
}) => {
  const containerRef = useRef(null);
  const hasScrolledRef = useRef(false); 
  
  const widths = { role: 60, empId: 90, name: 120, setting: 170, submit: 65, remand: 65, approve: 65, del: 45 };
  const stickyPositions = useMemo(() => {
    let currentLeft = 0;
    const positions = {};
    ['role', 'empId', 'name', 'setting', 'submit', 'remand', 'approve', 'del'].forEach(key => {
      positions[key] = currentLeft;
      currentLeft += widths[key];
    });
    return positions;
  }, [widths]);

  useEffect(() => {
    if (!containerRef.current) return;
    const today = new Date();
    
    if (today.getFullYear() === year && (today.getMonth() + 1) === month) {
        if (!hasScrolledRef.current) {
            setTimeout(() => {
                const container = containerRef.current;
                const target = container?.querySelector(`[data-day="${today.getDate()}"]`);
                if (container && target) {
                    const fixedColumnsWidth = Object.values(widths).reduce((a, b) => a + b, 0);
                    const scrollTo = target.offsetLeft - fixedColumnsWidth - (container.clientWidth - fixedColumnsWidth) / 2 + target.clientWidth / 2;
                    container.scrollTo({ left: Math.max(0, scrollTo), behavior: 'smooth' });
                    hasScrolledRef.current = true;
                }
            }, 300);
        }
    }
  }, [year, month, days, widths]);

  const stickyHeaderStyle = (key) => ({ position: 'sticky', left: stickyPositions[key], width: widths[key], minWidth: widths[key], maxWidth: widths[key], zIndex: 50 });
  const stickyCellStyle = (key) => ({ position: 'sticky', left: stickyPositions[key], width: widths[key], minWidth: widths[key], maxWidth: widths[key], zIndex: 30 });
  const headerCellBase = "sticky top-0 bg-slate-200 p-1.5 border-b-2 border-r border-slate-300 font-bold text-[11px] text-center h-12 flex items-center justify-center flex-shrink-0 box-border";
  const cellBase = "bg-white border-b border-r border-slate-300 flex items-center h-10 flex-shrink-0 box-border";

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 overflow-auto border border-slate-200 h-[75vh] relative">
        <div className="min-w-max">
            <div className="flex w-max sticky top-0 z-40">
                <div className={headerCellBase} style={stickyHeaderStyle('role')}>役職</div>
                <div className={headerCellBase} style={stickyHeaderStyle('empId')}>社員番号</div>
                <div className={headerCellBase} style={stickyHeaderStyle('name')}>稼働名前</div>
                <div className={headerCellBase} style={stickyHeaderStyle('setting')}>基本シフト設定</div>
                <div className={headerCellBase} style={stickyHeaderStyle('submit')}>提出☑</div>
                <div className={headerCellBase} style={stickyHeaderStyle('remand')}>差戻☑</div>
                <div className={headerCellBase} style={stickyHeaderStyle('approve')}>承認☑</div>
                <div className={`${headerCellBase} border-r-2`} style={stickyHeaderStyle('del')}>削除</div>
                {days.map(({ day, dayOfWeek }) => {
                    const isToday = new Date().getDate() === day && (new Date().getMonth()+1) === month;
                    return (
                        <div key={day} className={`${headerCellBase} bg-slate-200 whitespace-nowrap w-[75px] min-w-[75px] max-w-[75px] flex-col ${isToday ? 'bg-yellow-100' : ''}`} style={{ zIndex: 40 }} data-day={day}>
                            <div className="text-[9px] opacity-70 mb-1">{dayOfWeek}</div>
                            <div className="text-sm font-bold">{day}</div>
                            {isAdmin && (
                            <button onClick={() => onSetDayAsHolidayForAll(day)} className="group absolute bottom-0.5 right-0.5 p-0.5 bg-white/50 rounded-full hover:bg-sky-100">
                                {staff.every(s => typeof (schedule[s.id]?.[day]) === 'object' && (schedule[s.id]?.[day])?.locked) ? <UnlockIcon /> : <SetHolidayIcon />}
                            </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {staff.map(s => {
                const isEditable = isAdmin || currentUser?.id === s.id;
                const defaultShift = s.defaultShift || { pattern: [], hasBreakArray: [] };
                return (
                    <div key={s.id} className="flex w-max group hover:bg-slate-50 transition-colors">
                        <div className={cellBase} style={stickyCellStyle('role')}><EditableStaffInfoCell value={s.role} onUpdate={v => onUpdateStaffInfo(s.id, 'role', v)} disabled={!isEditable} className="border-none w-full" /></div>
                        <div className={cellBase} style={stickyCellStyle('empId')}><EditableStaffInfoCell value={s.employeeId} onUpdate={v => onUpdateStaffInfo(s.id, 'employeeId', v)} disabled={!isEditable} className="border-none w-full" /></div>
                        <div className={cellBase} style={stickyCellStyle('name')}><EditableStaffInfoCell value={s.name} onUpdate={v => onUpdateStaffInfo(s.id, 'name', v)} disabled={!isEditable} className="border-none w-full" /></div>
                        <div className={`${cellBase} px-1`} style={stickyCellStyle('setting')}>
                            <ShiftPatternEditor pattern={defaultShift.pattern} hasBreakArray={defaultShift.hasBreakArray} patterns={shiftPatterns} onApply={(p, hb) => onApplyStaffPattern(s.id, p, hb)} summary={summarizePattern(defaultShift.pattern, shiftPatterns, defaultShift.hasBreakArray)} disabled={!isEditable} />
                        </div>
                        <div className={`${cellBase} justify-center`} style={stickyCellStyle('submit')}><input type="checkbox" checked={s.shiftSubmitted?.[`${year}-${month}`] || false} onChange={() => onToggleShiftSubmitted(s.id)} className="h-4 w-4 rounded text-sky-600 cursor-pointer" disabled={!isEditable} /></div>
                        <div className={`${cellBase} justify-center`} style={stickyCellStyle('remand')}><input type="checkbox" checked={s.shiftRemanded?.[`${year}-${month}`] || false} onChange={() => onToggleShiftRemanded(s.id)} className="h-4 w-4 rounded text-red-600 cursor-pointer" disabled={!isAdmin} /></div>
                        <div className={`${cellBase} justify-center`} style={stickyCellStyle('approve')}><input type="checkbox" checked={s.shiftApproved?.[`${year}-${month}`] || false} onChange={() => onToggleShiftApproved(s.id)} className="h-4 w-4 rounded text-green-600 cursor-pointer" disabled={!isAdmin} /></div>
                        <div className={`${cellBase} justify-center border-r-2`} style={stickyCellStyle('del')}>{isAdmin && <button onClick={() => onDeleteStaff(s.id)} className="p-1 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={16} /></button>}</div>
                        {days.map(({ day }) => (
                            <EditableCell key={day} value={schedule[s.id]?.[day] ?? ''} onUpdate={v => onUpdateSchedule(s.id, day, v)} isAdmin={isAdmin} disabled={!isEditable} borderClass="border-slate-200" isToday={new Date().getDate() === day && (new Date().getMonth()+1) === month} />
                        ))}
                    </div>
                );
            })}
        </div>
    </div>
  );
};

// --- ShiftPatternDisplay ---
const AddShiftPatternModal = ({ onClose, onSave, existingPatterns }) => {
  const [id, setId] = useState('');
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('18:30');
  const [breakHours, setBreakHours] = useState('1.0');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!id.trim()) { setError('記号を入力してください。'); return; }
    if (existingPatterns.some(p => p.id === id.trim().toUpperCase())) { setError('使用されています。'); return; }
    const workHours = ((new Date(`1970/1/1 ${endTime}`) - new Date(`1970/1/1 ${startTime}`)) / 3600000) - parseFloat(breakHours);
    if (workHours <= 0) { setError('実働時間が0以下です'); return; }
    onSave({ id: id.trim().toUpperCase(), name: id.trim().toUpperCase(), startTime, endTime, breakHours: parseFloat(breakHours), workHours });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">新規パターン追加</h2>
        <div className="space-y-3">
            <input type="text" placeholder="記号 (例: A)" value={id} onChange={e=>setId(e.target.value)} className="w-full border p-2 rounded" />
            <div className="flex gap-2">
                <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="w-1/2 border p-2 rounded" />
                <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="w-1/2 border p-2 rounded" />
            </div>
            <input type="number" placeholder="休憩(h)" value={breakHours} onChange={e=>setBreakHours(e.target.value)} className="w-full border p-2 rounded" step="0.25" />
            {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded">キャンセル</button>
            <button onClick={handleSave} className="px-3 py-1 bg-[#F4B896] text-white rounded">保存</button>
        </div>
      </div>
    </div>
  );
};

const ShiftPatternDisplay = ({ patterns, onAddPattern }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <div className="flex justify-between items-center">
                <button onClick={() => setIsOpen(!isOpen)} className="flex-grow flex justify-between items-center text-left">
                    <h2 className="text-lg font-bold text-slate-800">シフトパターン一覧</h2>
                    <ChevronDownIcon />
                </button>
                <button onClick={() => setIsAddModalOpen(true)} className="ml-4 px-3 py-1.5 bg-[#F4B896] text-white text-xs font-semibold rounded-md hover:bg-[#E8A680]">+ パターンを追加</button>
            </div>
            {isOpen && (
                <div className="overflow-x-auto mt-3">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50"><tr><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">記号</th><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">時間</th><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">休憩</th><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">実働</th></tr></thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {patterns.map(p => <tr key={p.id}><td className="px-4 py-2 text-sm">{p.name}</td><td className="px-4 py-2 text-sm">{p.startTime}-{p.endTime}</td><td className="px-4 py-2 text-sm">{p.breakHours}h</td><td className="px-4 py-2 text-sm">{p.workHours}h</td></tr>)}
                        </tbody>
                    </table>
                </div>
            )}
            {isAddModalOpen && <AddShiftPatternModal onClose={()=>setIsAddModalOpen(false)} onSave={(p)=>{onAddPattern(p);setIsAddModalOpen(false)}} existingPatterns={patterns} />}
        </div>
    );
};

// --- TaskShortageDisplay ---
const TaskStaffSelector = ({ task, allStaff, assignedStaffIds, onUpdate, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const editorModal = isOpen ? createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4" onMouseDown={() => setIsOpen(false)}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onMouseDown={(e) => e.stopPropagation()}>
            <header className="p-4 border-b border-slate-200"><h3 className="font-bold text-slate-800">{task.name}の担当者</h3></header>
            <main className="p-4 overflow-y-auto space-y-1">
                {allStaff.map(member => (
                    <label key={member.id} className="flex items-center space-x-2 p-1.5 rounded hover:bg-slate-100 cursor-pointer">
                        <input type="checkbox" checked={assignedStaffIds.includes(member.id)} onChange={() => onUpdate(task.id, assignedStaffIds.includes(member.id) ? assignedStaffIds.filter(id=>id!==member.id) : [...assignedStaffIds, member.id])} className="form-checkbox h-4 w-4 text-[#D9824D] rounded border-slate-300" />
                        <span className="text-sm font-medium text-slate-700">{member.name}</span>
                    </label>
                ))}
            </main>
            <footer className="p-3 border-t bg-slate-50 flex justify-end"><button onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md">完了</button></footer>
        </div>
    </div>, document.body
  ) : null;
  return (
    <div className="w-full">
       <button onClick={() => !disabled && setIsOpen(true)} disabled={disabled} className={`w-full text-left p-1 rounded border flex justify-between items-center ${disabled ? 'bg-slate-100' : 'bg-white hover:border-[#F4B896]'}`}>
        <span className="text-xs font-medium truncate text-slate-800" title={assignedStaffIds.length + "名"}>{assignedStaffIds.length > 0 ? `${assignedStaffIds.length}名設定中` : '担当者なし'}</span>
        {!disabled && <ChevronDownIcon />}
      </button>
      {editorModal}
    </div>
  );
};

const TaskShortageDisplay = ({ tasks = [], staff = [], days = [], holidays = [], taskCountsByDay = {}, isAdmin = false, onUpdateTask, onDeleteTask, onUpdateTaskPersonnel, onUpdateTaskStaff }) => {
    const sortedStaff = useMemo(() => [...staff].sort((a, b) => String(a.employeeId || '').localeCompare(String(b.employeeId || ''), undefined, { numeric: true })), [staff]);
    return (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-3">業務一覧</h2>
            <div className="overflow-x-auto">
                 <div className="min-w-max">
                    <div className="grid" style={{ gridTemplateColumns: `280px repeat(${days.length}, minmax(70px, 1fr))`}}>
                        <div className="sticky left-0 z-40 bg-slate-200 p-2 border-b-2 border-r border-slate-300 font-semibold text-xs text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">業務</div>
                         {days.map(({ day, dayOfWeek }) => (
                            <div key={day} className={`sticky top-0 z-30 p-2 text-xs font-semibold text-center border-b-2 border-r whitespace-nowrap ${dayOfWeek==='土'?'bg-sky-100 text-sky-800':(dayOfWeek==='日'||holidays.includes(day)?'bg-pink-100 text-pink-800':'bg-slate-100')}`}>
                                <div>{day}</div><div>{dayOfWeek}</div>
                            </div>
                        ))}
                        {tasks.map((task) => {
                             const staffForTaskIds = staff.filter(s => (s.possibleTasks || []).includes(task.id)).map(s => s.id);
                             const required = task.requiredPersonnel ?? 3;
                            return (
                                <React.Fragment key={task.id}>
                                    <div className="sticky left-0 z-20 bg-slate-50 p-2 border-b border-r border-slate-300 text-xs font-semibold text-slate-600 flex flex-col items-start justify-center gap-1 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                            <div className="flex items-center justify-between w-full">
                                                <input type="text" value={task.name} onChange={(e) => onUpdateTask(task.id, e.target.value)} disabled={!isAdmin} className="text-xs font-semibold bg-transparent border-none w-full" />
                                                {isAdmin && <button onClick={() => onDeleteTask(task.id)} className="ml-2 p-1 hover:bg-red-100 rounded-full"><Trash2 size={14} /></button>}
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] w-full mb-1">
                                                <span className="text-slate-500 whitespace-nowrap">定員:</span>
                                                <input type="number" min="1" value={required} onChange={(e) => onUpdateTaskPersonnel(task.id, parseInt(e.target.value, 10))} disabled={!isAdmin} className="w-10 p-0.5 border border-slate-300 rounded text-center" />
                                                <span className="text-slate-500">名</span>
                                            </div>
                                            <TaskStaffSelector task={task} allStaff={sortedStaff} assignedStaffIds={staffForTaskIds} onUpdate={onUpdateTaskStaff} disabled={!isAdmin} />
                                    </div>
                                    {days.map(({ day, dayOfWeek }) => {
                                        const isHoliday = holidays.includes(day);
                                        const count = taskCountsByDay?.[day]?.[task.id];
                                        let className = "p-2 border-b text-center text-xs font-bold z-10 flex items-center justify-center border-r ";
                                        let content = '-';
                                        if (!(isHoliday || dayOfWeek === '日' || dayOfWeek === '土') && count !== undefined) {
                                            if (count >= required) {
                                                content = `${count}人`;
                                                className += 'text-slate-800 bg-slate-50 border-slate-300';
                                            } else {
                                                content = `不足 (${count}/${required})`;
                                                className += count/required <= 0.3 ? 'text-red-600 bg-red-100' : count/required <= 0.6 ? 'text-orange-600 bg-orange-100' : 'text-yellow-600 bg-yellow-100';
                                            }
                                        } else {
                                            className += 'text-slate-400 bg-slate-50 border-slate-200';
                                        }
                                        return <div key={`${task.id}-${day}`} className={className}>{content}</div>;
                                    })}
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MonthlyCalendar ---
const MonthlyCalendar = ({ schedule, staff, tasks, shiftPatterns, initialYear, initialMonth, onUpdateSchedule, isAdmin, currentUser }) => {
  const [currentDate, setCurrentDate] = useState(new Date(initialYear, initialMonth - 1, 1));
  const [selectedDateDetail, setSelectedDateDetail] = useState(null);
  const [viewMode, setViewMode] = useState('active_shifts');
  const scrollContainerRef = useRef(null);
  const hasScrolledRef = useRef(false); // 追加: 初回スクロール制御用

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = new Date(year, month, 1);
    const days = [];
    while (date.getMonth() === month) { days.push(new Date(date)); date.setDate(date.getDate() + 1); }
    return days;
  }, [currentDate]);

  useEffect(() => {
    if (scrollContainerRef.current) {
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === currentDate.getFullYear() && today.getMonth() === currentDate.getMonth();
        
        if (isCurrentMonth) {
            // 今月 かつ 初回のみスクロール
            if (!hasScrolledRef.current) {
                setTimeout(() => {
                    const el = scrollContainerRef.current?.querySelector(`[data-date="${formatDate(today)}"]`);
                    if (el) {
                        scrollContainerRef.current.scrollTo({ left: el.offsetLeft - scrollContainerRef.current.clientWidth/2 + el.clientWidth/2, behavior: 'smooth' });
                        hasScrolledRef.current = true;
                    }
                }, 100);
            }
        } else {
            // 月が変わったら左端に戻す
            scrollContainerRef.current.scrollLeft = 0; 
        }
    }
  }, [currentDate]);

  const events = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const key = `${year}-${month}`;
    const monthSchedule = schedule[key] || {};
    const eventList = [];
    Object.entries(monthSchedule).forEach(([staffId, days]) => {
        const s = staff.find(st => st.id === staffId);
        if (!s) return;
        Object.entries(days).forEach(([day, value]) => {
            if (!value || value === '') return;
            let displayText = value, isHoliday = false;
            if (typeof value === 'object' && value.type) {
                displayText = value.type === 'シフト休' ? 'シフト休' : `${value.type}${value.hours ? `(${value.hours})` : ''}`;
                if (['シフト休', '欠勤', '有休', '午前休', '午後休'].some(t => value.type.includes(t))) isHoliday = true;
            } else if (typeof value === 'number') { displayText = `${value}h`; } else if (value === 'シフト休') { isHoliday = true; }
            eventList.push({ id: `${staffId}-${day}`, staffId, date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, day: parseInt(day), year, month, userName: s.name, type: displayText, isHoliday, tasks: s.possibleTasks || [] });
        });
    });
    return eventList;
  }, [currentDate, schedule, staff]);

  return (
    <div className="mt-8 bg-white rounded-lg shadow-md ring-1 ring-black ring-opacity-5 p-4">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))} className="p-2 hover:bg-slate-200 rounded-full"><ChevronLeft /></button>
            <h2 className="text-xl font-bold text-slate-800">{currentDate.getFullYear()}年 {currentDate.getMonth()+1}月</h2>
            <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))} className="p-2 hover:bg-slate-200 rounded-full"><ChevronRight /></button>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setViewMode('active_shifts')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${viewMode === 'active_shifts' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500'}`}>出勤日</button>
            <button onClick={() => setViewMode('holidays')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${viewMode === 'holidays' ? 'bg-white text-[#D9824D] shadow-sm' : 'text-slate-500'}`}>休暇日</button>
        </div>
      </div>
      <div ref={scrollContainerRef} className="overflow-x-auto border border-slate-200 rounded-lg">
        <div className="inline-block min-w-full align-middle">
            <div className="flex border-b border-slate-200">
                <div className="sticky left-0 z-40 bg-slate-200 p-2 border-r border-slate-300 font-semibold text-xs text-center min-w-[100px] flex-shrink-0">日付</div>
                {daysInMonth.map((d) => {
                    const dateKey = formatDate(d);
                    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                    return <div key={d.toISOString()} data-date={dateKey} className={`p-2 text-xs font-semibold text-center border-r min-w-[100px] flex-shrink-0 ${dateKey === formatDate(new Date()) ? 'bg-yellow-100' : (dayOfWeek==='土'?'bg-sky-100':(dayOfWeek==='日'?'bg-pink-100':'bg-slate-100'))}`}><div>{d.getDate()}</div><div className="ml-1">({dayOfWeek})</div></div>;
                })}
            </div>
            <div className="flex">
                <div className="sticky left-0 z-30 bg-slate-50 p-2 border-r border-slate-300 font-semibold text-xs text-center min-w-[100px] flex-shrink-0">{viewMode === 'active_shifts' ? '出勤者' : '休日者'}</div>
                {daysInMonth.map((d) => {
                    const dateKey = formatDate(d);
                    const targetEvents = events.filter(e => e.date === dateKey && (viewMode === 'active_shifts' ? (!e.isHoliday && e.type !== '欠勤') : e.isHoliday));
                    return (
                        <div key={dateKey} className="border-r border-slate-200 min-w-[100px] p-1 flex-shrink-0 bg-white hover:bg-slate-50" onClick={() => setSelectedDateDetail({date:d, events:targetEvents})}>
                            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
                                {targetEvents.length > 0 ? targetEvents.map(ev => {
                                    const c = getColorForName(ev.userName);
                                    return <div key={ev.id} className="p-1 rounded text-[10px] border-l-2 truncate font-bold" style={{backgroundColor:c.bg, borderColor:c.border, color:c.text}}>{ev.userName}</div>
                                }) : <div className="text-[10px] text-slate-300 text-center py-4">-</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
      {selectedDateDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4" onClick={() => setSelectedDateDetail(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800">{selectedDateDetail.date.getDate()}日 詳細</h3>
                    <button onClick={() => setSelectedDateDetail(null)}><XIcon size={24} /></button>
                </div>
                <div className="p-6 overflow-y-auto grid grid-cols-2 gap-3">
                    {selectedDateDetail.events.map(ev => {
                        const c = getColorForName(ev.userName);
                        return <div key={ev.id} className="flex justify-between p-2 rounded border" style={{borderLeftColor: c.border, borderLeftWidth: 4}}><div><div className="font-bold">{ev.userName}</div><div className="text-xs">{ev.type}</div></div>{isAdmin && <button onClick={()=>onUpdateSchedule(ev.staffId, ev.day, '', ev.year, ev.month)} className="text-red-400"><Trash2 size={14}/></button>}</div>
                    })}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// --- Admin Modals ---
const MemberManagementModal = ({ staff, onClose, onSave }) => {
  const [editedStaff, setEditedStaff] = useState(() => JSON.parse(JSON.stringify(staff)));
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-slate-200"><h2 className="text-lg font-bold">メンバー管理</h2></header>
        <main className="p-4 overflow-y-auto flex-grow">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">名前</th><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">メール</th><th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Chat ID</th></tr></thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {editedStaff.map(member => (
                <tr key={member.id}>
                  <td className="px-4 py-2 text-sm">{member.name}</td>
                  <td className="px-4 py-2 text-sm"><input type="email" value={member.email||''} onChange={e=>setEditedStaff(prev=>prev.map(s=>s.id===member.id?{...s,email:e.target.value}:s))} className="border p-1 rounded w-full"/></td>
                  <td className="px-4 py-2 text-sm"><input type="text" value={member.chatUserId||''} onChange={e=>setEditedStaff(prev=>prev.map(s=>s.id===member.id?{...s,chatUserId:e.target.value}:s))} className="border p-1 rounded w-full"/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
        <footer className="p-4 border-t flex justify-end gap-2 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md">キャンセル</button>
          <button onClick={() => onSave(editedStaff)} className="px-4 py-2 bg-[#F4B896] text-white rounded-md">保存</button>
        </footer>
      </div>
    </div>
  );
};

const AdminSettingsModal = ({ adminConfig, onClose, onSave }) => {
  const [submissionNotificationIds, setSubmissionNotificationIds] = useState(adminConfig.submissionNotificationIds || "");
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold mb-4">通知設定</h2>
        <label className="block text-sm mb-2">提出通知先User ID (カンマ区切り)</label>
        <textarea value={submissionNotificationIds} onChange={e=>setSubmissionNotificationIds(e.target.value)} className="w-full border p-2 rounded h-32" />
        <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md">キャンセル</button>
            <button onClick={() => onSave({...adminConfig, submissionNotificationIds})} className="px-4 py-2 bg-[#F4B896] text-white rounded-md">保存</button>
        </div>
      </div>
    </div>
  );
};

const TaskStaffMappingEditor = ({ staff, tasks, onClose, onSave }) => {
  const [map, setMap] = useState({});
  useEffect(() => {
    const m = {};
    tasks.forEach(t => m[t.id] = staff.filter(s => (s.possibleTasks||[]).includes(t.id)).map(s=>s.id));
    setMap(m);
  }, [staff, tasks]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <header className="p-4 border-b border-slate-200"><h2 className="text-lg font-bold">業務担当設定</h2></header>
        <main className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map(t => (
                <div key={t.id} className="border p-3 rounded">
                    <h3 className="font-bold border-b mb-2">{t.name}</h3>
                    <div className="flex gap-2 mb-2 text-xs text-[#D9824D]"><button onClick={()=>setMap(p=>({...p,[t.id]:staff.map(s=>s.id)}))}>全選択</button><button onClick={()=>setMap(p=>({...p,[t.id]:[]}))}>全解除</button></div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                        {staff.map(s => (
                            <label key={s.id} className="flex items-center gap-2"><input type="checkbox" checked={(map[t.id]||[]).includes(s.id)} onChange={()=>{
                                setMap(p=>{
                                    const cur=p[t.id]||[];
                                    return {...p,[t.id]:cur.includes(s.id)?cur.filter(i=>i!==s.id):[...cur,s.id]};
                                });
                            }} className="text-[#D9824D]"/> <span className="text-xs">{s.name}</span></label>
                        ))}
                    </div>
                </div>
            ))}
        </main>
        <footer className="p-4 border-t flex justify-end gap-2 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 rounded-md">キャンセル</button>
          <button onClick={() => onSave(map)} className="px-4 py-2 bg-[#F4B896] text-white rounded-md">保存</button>
        </footer>
      </div>
    </div>
  );
};

// =============================================================================
// 4. Main App
// =============================================================================

const STORAGE_KEY = 'smart-shift-scheduler-v1';

const App = () => {
  // Helper to load from storage or default
  const loadState = (key, fallback) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[key] || fallback;
      }
    } catch (e) {
      console.error("Failed to load", e);
    }
    return fallback;
  };

  const [staff, setStaff] = useState(() => loadState('staff', initialStaffData));
  const [tasks, setTasks] = useState(() => loadState('tasks', initialTasks));
  const [shiftPatterns, setShiftPatterns] = useState(() => loadState('shiftPatterns', initialShiftPatterns));
  const [adminConfig, setAdminConfig] = useState(() => loadState('adminConfig', initialAdminConfig));

  // For schedule, we need to ensure it has data if empty
  const [schedule, setSchedule] = useState(() => {
     const savedSchedule = loadState('schedule', null);
     if (savedSchedule) return savedSchedule;
     
     // Generate initial schedule if nothing saved
     const today = new Date();
     const y = today.getFullYear();
     const m = today.getMonth() + 1;
     return {
         [`${y}-${m}`]: generateScheduleForMonth(y, m, initialStaffData, initialShiftPatterns)
     };
  });

  // Save on change
  useEffect(() => {
    const data = { staff, tasks, shiftPatterns, adminConfig, schedule };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [staff, tasks, shiftPatterns, adminConfig, schedule]);

  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Mock Authentication
  const currentUser = { id: 'admin', name: '管理者', email: 'admin@example.com' };
  const isAdmin = true; // Always admin for demo

  // Modals
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [isTaskMappingOpen, setIsTaskMappingOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 500);
  }, []);

  const key = `${year}-${month}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentMonthHolidays = useMemo(() => getJapaneseHolidays(year, month), [year, month]);
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month - 1, i + 1);
    return { day: i + 1, dayOfWeek: ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] };
  }), [year, month, daysInMonth]);

  const taskCountsByDay = useMemo(() => {
    const counts = {};
    days.forEach(({day}) => {
      counts[day] = {};
      tasks.forEach(t => counts[day][t.id] = 0);
      staff.forEach(s => {
        const val = schedule[key]?.[s.id]?.[day];
        const isWorking = (typeof val === 'number' && val > 0) || (val?.hours > 0);
        if (isWorking) {
          (s.possibleTasks || []).forEach(tId => {
            if (counts[day][tId] !== undefined) counts[day][tId] = (counts[day][tId] || 0) + 1;
          });
        }
      });
    });
    return counts;
  }, [schedule, key, staff, tasks, days]);

  const handleUpdateSchedule = (staffId, day, value) => {
    setSchedule(prev => {
      const newMonth = { ...(prev[key] || {}) };
      const newStaff = { ...(newMonth[staffId] || {}) };
      newStaff[day] = value;
      newMonth[staffId] = newStaff;
      return { ...prev, [key]: newMonth };
    });
  };

  const handleApplyStaffPattern = (staffId, newPattern, hasBreakArray) => {
    setStaff(prev => prev.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreakArray } } : s));
    const newMonthSchedule = {};
    days.forEach(({day, dayOfWeek}) => {
        if (['土','日'].includes(dayOfWeek) || currentMonthHolidays.includes(day)) {
            newMonthSchedule[day] = 'シフト休';
        } else {
            const pId = newPattern[['月','火','水','木','金'].indexOf(dayOfWeek)];
            if (pId === 'シフト休') {
                newMonthSchedule[day] = 'シフト休';
            } else {
                const pattern = shiftPatterns.find(p => p.id === pId);
                if (pattern) {
                    const isBreak = hasBreakArray[['月','火','水','木','金'].indexOf(dayOfWeek)];
                    newMonthSchedule[day] = isBreak ? pattern.workHours : (pattern.workHours + 1);
                }
            }
        }
    });
    setSchedule(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [staffId]: newMonthSchedule } }));
  };

  const handleAddStaff = () => {
    setStaff(prev => [...prev, { id: `user_${Date.now()}`, name: '新規メンバー', role: '役職', employeeId: '', email: '', possibleTasks: [], defaultShift: { pattern: Array(5).fill('シフト休'), hasBreakArray: Array(5).fill(true) } }]);
  };

  const handleAddTask = () => {
    setTasks(prev => [...prev, { id: `task_${Date.now()}`, name: '新規業務', requiredPersonnel: 1 }]);
  };

  if (isLoading) return <LoadingScreen message="読み込み中..." />;

  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="mb-4 bg-[#F4B896] text-white rounded-md shadow-lg p-3 flex justify-between items-center sticky top-0 z-[60]">
          <div className="flex items-center gap-4">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-transparent border-none font-bold text-black text-2xl outline-none cursor-pointer">
              {Array.from({length: 5}, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xl">年</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-transparent border-none font-bold text-black text-2xl outline-none cursor-pointer">
              {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <span className="text-xl">月</span>
            <h1 className="text-2xl font-bold tracking-wider ml-4 hidden sm:block">digsyシフト表</h1>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setIsHelpOpen(true)} className="px-3 py-1.5 bg-white/20 rounded hover:bg-white/30 text-sm font-bold transition-colors">ガイド</button>
          </div>
        </header>

        {/* 1. 最上段：シフト表 */}
        <ShiftSchedule 
          currentUser={currentUser} isAdmin={isAdmin} schedule={schedule[key] || {}} staff={staff} days={days} holidays={currentMonthHolidays} shiftPatterns={shiftPatterns} year={year} month={month}
          onUpdateSchedule={handleUpdateSchedule} 
          onDeleteStaff={(id) => setConfirmDelete({ type: 'staff', id, name: staff.find(s => s.id === id)?.name })}
          onUpdateStaffInfo={(id,f,v) => setStaff(prev => prev.map(s => s.id === id ? { ...s, [f]: v } : s))}
          onApplyStaffPattern={handleApplyStaffPattern}
          onToggleShiftSubmitted={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftSubmitted: { ...s.shiftSubmitted, [key]: !s.shiftSubmitted?.[key] } } : s))}
          onToggleShiftApproved={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: !s.shiftApproved?.[key] } } : s))}
          onToggleShiftRemanded={(id) => setStaff(prev => prev.map(s => s.id === id ? { ...s, shiftRemanded: { ...s.shiftRemanded, [key]: !s.shiftRemanded?.[key] } } : s))}
          onSetDayAsHolidayForAll={(day) => setSchedule(prev => { const nm = { ...(prev[key] || {}) }; staff.forEach(s => { if(!nm[s.id]) nm[s.id] = {}; nm[s.id][day] = 'シフト休'; }); return { ...prev, [key]: nm }; })}
        />

        {/* 2. 上段：シフトパターン一覧 */}
        <ShiftPatternDisplay patterns={shiftPatterns} onAddPattern={(np) => setShiftPatterns(prev => [...prev, np])} />

        {/* 3. 中段：業務一覧 */}
        <TaskShortageDisplay 
            tasks={tasks} staff={staff} days={days} holidays={currentMonthHolidays} taskCountsByDay={taskCountsByDay} isAdmin={isAdmin}
            onUpdateTask={(id, name) => setTasks(prev => prev.map(t => t.id === id ? { ...t, name } : t))}
            onDeleteTask={(id) => setConfirmDelete({ type: 'task', id, name: tasks.find(t=>t.id===id)?.name })}
            onUpdateTaskPersonnel={(id, num) => setTasks(prev => prev.map(t => t.id === id ? { ...t, requiredPersonnel: num } : t))}
            onUpdateTaskStaff={(tid, sids) => setStaff(prev => prev.map(s => ({ ...s, possibleTasks: sids.includes(s.id) ? (s.possibleTasks.includes(tid) ? s.possibleTasks : [...s.possibleTasks, tid]) : s.possibleTasks.filter(t=>t!==tid) })))}
        />

        {/* 4. 下部：マンスリーカレンダー */}
        <MonthlyCalendar schedule={schedule} staff={staff} tasks={tasks} shiftPatterns={shiftPatterns} initialYear={year} initialMonth={month} onUpdateSchedule={handleUpdateSchedule} isAdmin={isAdmin} currentUser={currentUser} key={`${year}-${month}`} />

        {/* 5. 最下部：各種設定ボタン */}
        {isAdmin && (
            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">管理者メニュー</h3>
                <div className="flex flex-wrap gap-3">
                     <button onClick={handleAddStaff} className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded shadow hover:bg-emerald-600">+ メンバー追加</button>
                    <button onClick={handleAddTask} className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded shadow hover:bg-emerald-600">+ 業務追加</button>
                    <div className="h-auto w-px bg-slate-300 mx-2"></div>
                    <button onClick={() => setIsTaskMappingOpen(true)} className="px-4 py-2 bg-[#D9824D] text-white text-sm font-bold rounded shadow hover:bg-[#c57242]">業務担当設定</button>
                    <button onClick={() => setIsMemberModalOpen(true)} className="px-4 py-2 bg-slate-600 text-white text-sm font-bold rounded shadow hover:bg-slate-700">メンバー管理</button>
                    <button onClick={() => setIsAdminSettingsOpen(true)} className="px-4 py-2 bg-slate-500 text-white text-sm font-bold rounded shadow hover:bg-slate-600">通知設定</button>
                     <div className="h-auto w-px bg-slate-300 mx-2"></div>
                    <button onClick={() => downloadScheduleCSV({ staff, tasks, schedule, shiftPatterns, taskCountsByDay, days, year, month })} className="px-4 py-2 bg-gray-100 text-slate-700 border border-slate-300 text-sm font-bold rounded shadow-sm hover:bg-gray-200 flex items-center gap-2">CSV出力</button>
                </div>
            </div>
        )}
      </div>
      
      {/* Modals */}
      {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
      {confirmDelete && <ConfirmDeleteModal itemType={confirmDelete.type === 'staff' ? "メンバー" : "業務"} itemName={confirmDelete.name} onConfirm={() => { if(confirmDelete.type === 'staff') setStaff(prev => prev.filter(s => s.id !== confirmDelete.id)); else setTasks(prev => prev.filter(t => t.id !== confirmDelete.id)); setConfirmDelete(null); }} onCancel={() => setConfirmDelete(null)} />}
      {isMemberModalOpen && <MemberManagementModal staff={staff} onClose={() => setIsMemberModalOpen(false)} onSave={(updatedStaff) => { setStaff(updatedStaff); setIsMemberModalOpen(false); }} />}
      {isAdminSettingsOpen && <AdminSettingsModal adminConfig={adminConfig} onClose={() => setIsAdminSettingsOpen(false)} onSave={(newConfig) => { setAdminConfig(newConfig); setIsAdminSettingsOpen(false); }} />}
      {isTaskMappingOpen && <TaskStaffMappingEditor staff={staff} tasks={tasks} onClose={() => setIsTaskMappingOpen(false)} onSave={(mapping) => { setStaff(prev => prev.map(s => { const newTasks = []; Object.entries(mapping).forEach(([taskId, staffIds]) => { if(staffIds.includes(s.id)) newTasks.push(taskId); }); return { ...s, possibleTasks: newTasks }; })); setIsTaskMappingOpen(false); }} />}
    </div>
  );
};

export default App;
