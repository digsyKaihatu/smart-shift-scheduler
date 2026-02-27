// ... existing code ...
  // 4. 承認後の変更確定処理
  const handleFinalizeModification = async () => {
    const targetStaffIds = [...new Set(pendingChanges.map(c => c.staffId))];
    setIsLoading(true);
    setLoadingMessage('変更を確定中...');
    
    try {
      const updatesToSave = [];

      for (const sId of targetStaffIds) {
        const staffChanges = pendingChanges.filter(c => c.staffId === sId);
        const targetStaff = staff.find(s => s.id === sId);
        if (!targetStaff) continue;

        const changeDetails = staffChanges.map(c => `${c.rawMonth}/${c.day}: ${String(c.displayValue).replace(/\(undefined\)/g, '')}`).join('\n');
        const dateSummary = staffChanges.map(c => c.day).join(', ');
        let mentions = '';
        if (adminConfig?.submissionNotificationIds) {
          mentions = adminConfig.submissionNotificationIds.split(',').map(id => id.trim()).filter(id => id !== '').map(id => `<users/${id}>`).join(' ');
        }

        await chatService.sendChangeAfterApproval(targetStaff.name, year, month, dateSummary, changeDetails, mentions);
        
        setStaff(prev => prev.map(s => s.id === sId ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: false } } : s));
        
        // 保存用配列にデータを追加
        staffChanges.forEach(c => {
           const val = c.rawValue;
           let cleanedVal = val;
           if (typeof val === 'object' && val !== null) {
               const { modified, ...rest } = val;
               cleanedVal = Object.keys(rest).length === 1 && rest.type ? rest.type : rest;
               if (rest.type === '稼働' && typeof rest.hours === 'number') cleanedVal = rest.hours;
           }
           updatesToSave.push({ staffId: sId, day: c.day, value: cleanedVal });
        });
      }

      // Firestoreに一括保存
      if (updatesToSave.length > 0) {
        updateShiftItems(year, month, updatesToSave);
      }

    } catch (error) {
      alert('通知の送信に失敗しました。');
    }

    setIsLoading(false);
    setPendingChanges([]);
    setShowModificationConfirm(false);
  };

  return {
// ... existing code ...
