// 基本パターン適用ロジック
  const handleApplyStaffPattern = (sid, p, hb) => {
    const targetStaff = staff.find(s => s.id === sid);
    if (!targetStaff) return;

    // 1. スタッフマスタ（基本シフト設定）の更新
    setStaff(prev => prev.map(s => s.id === sid ? { ...s, defaultShift: { pattern: p, hasBreakArray: hb } } : s));
    
    // 2. 新しいパターンで1ヶ月分のスケジュールを生成
    const newStaffMock = { ...targetStaff, defaultShift: { pattern: p, hasBreakArray: hb } };
    const newGenerated = generateScheduleForMonth(year, month, [newStaffMock], shiftPatterns, currentMonthHolidays)[sid] || {};

    const isApproved = targetStaff.shiftApproved?.[key];
    const pendingNew = [];
    const updates = [];

    days.forEach(d => {
      const day = d.day;
      const newExpectedValue = newGenerated[day] ?? '';
      const currentValue = currentMonthSchedule[sid]?.[day] ?? '';

      // ★ 新ロジック：カレンダーの現在の値が「手動で保護すべき値（有休・欠勤・ロック済みなど）」か判定
      let isProtected = false;
      if (typeof currentValue === 'object' && currentValue !== null) {
          if (currentValue.locked) isProtected = true; // 管理者の休日ロックは保護
          else if (currentValue.type && currentValue.type !== '稼働' && currentValue.type !== 'シフト休') isProtected = true; // 有休などの特殊オブジェクトは保護
      } else if (typeof currentValue === 'string' && currentValue !== '' && currentValue !== 'シフト休') {
          if (isNaN(parseFloat(currentValue))) {
              isProtected = true; // 文字列かつ数値ではない（例：「有休」「午後有(3.5)」など）は保護
          }
      }

      // 保護されていないセル（空、シフト休、通常の稼働時間）であれば上書き対象
      if (!isProtected) {
          let normCurrent = currentValue;
          if (typeof currentValue === 'object' && currentValue !== null) {
              normCurrent = currentValue.type === '稼働' ? currentValue.hours : currentValue.type;
          }
          
          // 値が実際に変わる場合のみ更新リストに追加
          if (String(normCurrent) !== String(newExpectedValue)) {
              if (isApproved) {
                  let newValue = newExpectedValue;
                  if (typeof newValue === 'number') newValue = { type: '稼働', hours: newValue, modified: true };
                  else if (typeof newValue === 'string') newValue = { type: newValue, modified: true };
                  
                  pendingNew.push({
                      staffId: sid, day, 
                      displayValue: formatValue(newValue), 
                      rawYear: year, rawMonth: month, 
                      rawValue: newValue, originalValue: currentValue
                  });
                  updates.push({ staffId: sid, day, value: newValue });
              } else {
                  updates.push({ staffId: sid, day, value: newExpectedValue });
              }
          }
      }
    });

    // 承認済みシフトを変更した場合は保留リストに追加して確認バーを表示
    if (isApproved && pendingNew.length > 0) {
        actions.setPendingChanges(prev => {
            const filtered = prev.filter(c => !(c.staffId === sid && pendingNew.some(n => n.day === c.day)));
            return [...filtered, ...pendingNew];
        });
        actions.setShowModificationConfirm(true);
    }

    // 実際のデータを一括更新
    if (updates.length > 0) {
        updateShiftItems(year, month, updates);
    }
  };
