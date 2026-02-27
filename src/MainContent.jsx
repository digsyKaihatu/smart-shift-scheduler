// ... existing code ...
  // データ取得フック
  const {
    staff, setStaff, schedule, updateShiftItem, updateShiftItems, updateLocalShiftItem, updateShiftUserMonth,
    tasks, setTasks, shiftPatterns, setShiftPatterns, adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading, saveStatus, initialDataLoaded
  } = useShiftData(year, month);
// ... existing code ...
  // ハンドラー
  const handleUpdateSchedule = (staffId, day, value) => {
    const currentVal = schedule[key]?.[staffId]?.[day];
    if (JSON.stringify(currentVal) === JSON.stringify(value)) return;

    const isApproved = staff.find(s => s.id === staffId)?.shiftApproved?.[key];
    let newValue = value;

    if (isApproved) {
        if (typeof value === 'number') newValue = { type: '稼働', hours: value, modified: true };
        else if (typeof value === 'string') newValue = { type: value, modified: true };
        else if (typeof value === 'object' && value !== null) newValue = { ...value, modified: true };
        
        actions.setPendingChanges(prev => [...prev.filter(c => !(c.staffId === staffId && c.day === day)), {
            staffId, day, displayValue: formatValue(newValue), rawYear: year, rawMonth: month, rawValue: newValue
        }]);
        actions.setShowModificationConfirm(true);
        
        // Firestoreには保存せず、ローカルStateのみ更新
        updateLocalShiftItem(year, month, staffId, day, newValue);
    } else {
        if (isAdmin && value === '欠') {
            actions.setAbsenceNotificationConfirmation({ staffMember: staff.find(s => s.id === staffId), day, value });
        }
        updateShiftItem(year, month, staffId, day, newValue);
    }
  };

  const executeDelete = () => {
// ... existing code ...
  return (
    <div className="min-h-screen bg-[#FFF9F6] text-slate-800 p-2 sm:p-4 font-sans relative">
      {actions.pendingChanges.length > 0 && !actions.showModificationConfirm && (
        <div className="fixed top-0 left-0 right-0 bg-orange-100 border-b border-orange-300 text-orange-800 px-4 py-2 z-[60] shadow-md flex justify-between items-center animate-slideDown">
          <div className="flex items-center gap-2">
            <span className="font-bold">承認済みシフトの変更が {actions.pendingChanges.length} 件保留されています。<span className="text-sm font-normal ml-2">※確定するまで保存されません</span></span>
          </div>
          <button onClick={actions.handleFinalizeModification} className="px-4 py-1 bg-orange-500 text-white text-sm font-bold rounded hover:bg-orange-600 shadow">変更を確定して通知</button>
        </div>
      )}

      <div className="max-w-screen-2xl mx-auto pt-2">
// ... existing code ...
