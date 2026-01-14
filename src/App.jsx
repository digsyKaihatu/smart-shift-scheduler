// ... (前後のコードは変更なし)

  const handleApplySingleStaffPattern = (staffId, newPattern, hasBreak) => {
    // defaultShiftにhasBreakを含めるよう修正
    setStaff(prevStaff => prevStaff.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreak } } : s));
    
    const key = `${year}-${month}`;
    const newMonthScheduleForStaff = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = getJapaneseHolidays(year, month);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); 
        const isHoliday = monthHolidays.includes(day);
        let shiftValue;
        if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) {
            shiftValue = 'シフト休'; // '休' から 'シフト休' へ表記の統一
        } else {
            const patternIndex = dayOfWeek - 1; 
            const patternId = newPattern[patternIndex];
            if (typeof patternId === 'string' && patternId !== 'シフト休') {
                const pattern = shiftPatterns.find(p => p.id === patternId);
                shiftValue = pattern ? pattern.workHours : '';
            } else {
                shiftValue = patternId; 
            }
        }
        newMonthScheduleForStaff[day] = shiftValue ?? '';
    }
    
    setSchedule(prevSchedule => {
      const newMonthSchedule = { ...(prevSchedule[key] || {}) };
      newMonthSchedule[staffId] = newMonthScheduleForStaff;
      return { ...prevSchedule, [key]: newMonthSchedule };
    });
  };

// ... (残りのコードは変更なし)
