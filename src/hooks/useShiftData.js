// ... existing code ...
  // 変更差分を保持するRef (Key: "YYYY-MM", Value: { "scheduleData.staffId.day": value, ... })
  const pendingChanges = useRef({});
  // 通信中（保存中）の差分を保持するRef（通信タイムラグによる画面のチラつき防止用）
  const inflightChanges = useRef({});
  // Firestoreに保存しない、ローカルだけの変更を保持するRef（承認済みシフトの変更中など）
  const localPendingChanges = useRef({});

  // ドキュメント参照
  const configDocRef = doc(db, "schedules", "config");
// ... existing code ...
              // 自分が編集して送信待ち、または送信中のデータ（activeChanges）を取得
              const activeChanges = { 
                ...(inflightChanges.current[key] || {}), 
                ...(pendingChanges.current[key] || {}) 
              };
              
              let hasPendingForThisStaff = false;
              for (const activeKey in activeChanges) {
                if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                   hasPendingForThisStaff = true;
                   break;
                }
              }
              
              // 追加：ローカルのみの変更があるかチェック
              if (localPendingChanges.current[key]) {
                 for (const localKey in localPendingChanges.current[key]) {
                    if (localKey.startsWith(`${staffId}.`)) {
                        hasPendingForThisStaff = true;
                        break;
                    }
                 }
              }

              // 自分の未送信・送信中変更がなければ、サーバーのデータをそのまま採用
              if (!hasPendingForThisStaff) {
                 nextMonthData[staffId] = serverStaffData;
                 hasChange = true;
              } else {
                 // 自分の変更がある場合は、サーバーの最新データに自分の変更をマージして保持（上書き防止）
                 const mergedStaffData = { ...serverStaffData };
                 for (const activeKey in activeChanges) {
                     if (activeKey.startsWith(`scheduleData.${staffId}.`)) {
                         const dayStr = activeKey.split('.').pop();
                         mergedStaffData[dayStr] = activeChanges[activeKey];
                     }
                 }
                 // さらにローカルのみの変更を被せる
                 if (localPendingChanges.current[key]) {
                     for (const localKey in localPendingChanges.current[key]) {
                         if (localKey.startsWith(`${staffId}.`)) {
                             const dayStr = localKey.split('.').pop();
                             if (prevMonthData[staffId] && prevMonthData[staffId][dayStr] !== undefined) {
                                 mergedStaffData[dayStr] = prevMonthData[staffId][dayStr];
                             }
                         }
                     }
                 }
                 // マージした結果、ローカルと差分がある場合のみ更新フラグを立てる
                 if (!isStaffDataEqual(mergedStaffData, localStaffData)) {
                     nextMonthData[staffId] = mergedStaffData;
// ... existing code ...
    // 3. 保存タイマー開始
    triggerScheduleSave();
  }, [triggerScheduleSave]);

  // Firestoreに保存せず、ローカル（画面上）のみでシフトを更新する関数
  const updateLocalShiftItem = useCallback((year, month, staffId, day, value) => {
    const key = `${year}-${month}`;
    
    setSchedule(prev => {
      const currentMonthData = prev[key] || {};
      const currentStaffData = currentMonthData[staffId] || {};
      if (JSON.stringify(currentStaffData[day]) === JSON.stringify(value)) return prev;
      return { ...prev, [key]: { ...currentMonthData, [staffId]: { ...currentStaffData, [day]: value } } };
    });

    if (!localPendingChanges.current[key]) localPendingChanges.current[key] = {};
    localPendingChanges.current[key][`${staffId}.${day}`] = true;
  }, []);

  // 複数セルの更新 (一括更新、パターン適用など)
  const updateShiftItems = useCallback((year, month, updates) => {
    if (!updates || updates.length === 0) return;
// ... existing code ...
    if (!pendingChanges.current[key]) pendingChanges.current[key] = {};
    
    updates.forEach(({ staffId, day, value }) => {
      pendingChanges.current[key][`scheduleData.${staffId}.${day}`] = value;
      // 保存対象になったらローカルフラグを解除
      if (localPendingChanges.current[key]?.[`${staffId}.${day}`]) {
          delete localPendingChanges.current[key][`${staffId}.${day}`];
      }
    });

    triggerScheduleSave();
  }, [triggerScheduleSave]);
// ... existing code ...
  return {
    staff, setStaff,
    schedule, 
    updateShiftItem,
    updateLocalShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
// ... existing code ...
