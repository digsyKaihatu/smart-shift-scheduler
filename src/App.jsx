// ... (前後のコードは変更なし)

  const handleApplyStaffPattern = (staffId, newPattern, hasBreakArray) => {
    // defaultShiftに曜日別の休憩設定（hasBreakArray）を保存
    setStaff(prevStaff => prevStaff.map(s => s.id === staffId ? { ...s, defaultShift: { pattern: newPattern, hasBreakArray } } : s));
    
    const key = `${year}-${month}`;
    const newMonthScheduleForStaff = {};
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthHolidays = getJapaneseHolidays(year, month);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); 
        const isHoliday = monthHolidays.includes(day);
        let shiftValue = '';
        
        if (isHoliday || dayOfWeek === 0 || dayOfWeek === 6) {
            shiftValue = 'シフト休';
        } else {
            const pId = newPattern[dayOfWeek - 1];
            if (pId === 'シフト休') {
                shiftValue = 'シフト休';
            } else {
                const pattern = shiftPatterns.find(p => p.id === pId);
                if (pattern) {
                    // 休憩設定に基づいて時間を計算
                    const isBreakEnabled = hasBreakArray && hasBreakArray[dayOfWeek - 1];
                    if (isBreakEnabled) {
                        shiftValue = pattern.workHours;
                    } else {
                        // 休憩なしの場合：(終了時間 - 開始時間)
                        // 簡易計算：workHours + breakTime (1:00なら1)
                        const breakNum = parseFloat(pattern.breakTime?.split(':')[0] || 1);
                        shiftValue = pattern.workHours + breakNum;
                    }
                }
            }
        }
        newMonthScheduleForStaff[day] = shiftValue;
    }
    
    setSchedule(prevSchedule => ({
      ...prevSchedule,
      [key]: {
        ...(prevSchedule[key] || {}),
        [staffId]: newMonthScheduleForStaff
      }
    }));
  };

// ... (残りのコードは変更なし)
