import { useState, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { summarizePattern } from '../utils/scheduleUtils';

/**
 * シフトに関する各種アクション（提出、承認、通知など）を管理するフック
 */
export const useShiftActions = ({
  staff, setStaff, schedule, year, month, adminConfig, shiftPatterns,
  setIsLoading, setLoadingMessage, updateShiftItems
}) => {
  const key = `${year}-${month}`;

  // 承認後の変更管理
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showModificationConfirm, setShowModificationConfirm] = useState(false);

  // 通知・確認用の一時状態
  const [submissionConfirmation, setSubmissionConfirmation] = useState(null);
  const [remandConfirmation, setRemandConfirmation] = useState(null);
  const [approvalModalStaffId, setApprovalModalStaffId] = useState(null);
  const [absenceNotificationConfirmation, setAbsenceNotificationConfirmation] = useState(null);
  const [approvalCancellationConfirmation, setApprovalCancellationConfirmation] = useState(null);

  // ==========================================
  // 1. 提出処理
  // ==========================================
  const handleToggleShiftSubmitted = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftSubmitted?.[key]) {
      setStaff(prev => prev.map(x => x.id === staffId ? { 
        ...x, 
        shiftSubmitted: { ...x.shiftSubmitted, [key]: false } 
      } : x));
    } else {
      setSubmissionConfirmation({ staffId, name: s.name });
    }
  }, [staff, key, setStaff]);

  const handleConfirmSubmission = async () => {
    if (!submissionConfirmation) return;
    const { staffId, name } = submissionConfirmation;
    let mentions = '';
    if (adminConfig?.submissionNotificationIds) {
      mentions = adminConfig.submissionNotificationIds.split(',')
        .map(id => id.trim())
        .filter(id => id !== '')
        .map(id => `<users/${id}>`)
        .join(' ');
    }
    
    // UIを即座に更新してチェックを付ける（即時反映）
    setStaff(prev => prev.map(x => x.id === staffId ? { 
      ...x, 
      shiftSubmitted: { ...x.shiftSubmitted, [key]: true } 
    } : x));
    setSubmissionConfirmation(null);

    try { 
      await chatService.sendSubmission(name, year, month, mentions); 
    } catch (e) { 
      // 【修正点】通知に失敗してもチェックは外さず、警告のみ表示する
      console.error("提出通知の送信に失敗しました:", e);
      alert(`チャットへの通知に失敗しましたが、シフトの提出は完了しました。\n(エラー詳細: ${e.message})`);
    }
  };

  // ==========================================
  // 2. 差戻処理
  // ==========================================
  const handleToggleShiftRemanded = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftRemanded?.[key]) {
      setStaff(prev => prev.map(x => x.id === staffId ? { 
        ...x, 
        shiftRemanded: { ...x.shiftRemanded, [key]: false } 
      } : x));
    } else {
      setRemandConfirmation({ staffId, name: s.name });
    }
  }, [staff, key, setStaff]);

  const handleConfirmRemand = async () => {
    if (!remandConfirmation) return;
    const { staffId, name } = remandConfirmation;
    const s = staff.find(x => x.id === staffId);
    
    setStaff(prev => prev.map(x => x.id === staffId ? { 
      ...x, 
      shiftRemanded: { ...x.shiftRemanded, [key]: true } 
    } : x));
    setRemandConfirmation(null);

    try { 
      await chatService.sendRemand(name, s.chatUserId); 
    } catch (e) { 
      // 【修正点】通知に失敗してもチェックは外さず、警告のみ表示する
      console.error("差戻通知の送信に失敗しました:", e);
      alert(`チャットへの通知に失敗しましたが、シフトの差戻は完了しました。\n(エラー詳細: ${e.message})`);
    }
  };

  // ==========================================
  // 3. 承認処理
  // ==========================================
  const handleToggleShiftApproved = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftApproved?.[key]) {
      setApprovalCancellationConfirmation({ staffId, name: s.name });
    } else {
      setApprovalModalStaffId(staffId);
    }
  }, [staff, key]);

  const handleConfirmApproval = async (remarks, irregularText) => {
    if (!approvalModalStaffId) return;
    const targetId = approvalModalStaffId;
    const s = staff.find(x => x.id === targetId);

    setStaff(prev => prev.map(x => x.id === targetId ? { 
      ...x, 
      shiftApproved: { ...x.shiftApproved, [key]: true } 
    } : x));
    setApprovalModalStaffId(null);

    // 【修正点】通知の成功/失敗に関わらず、承認済みのシフト変更（オレンジ色のセル）を確定させる
    const staffSchedule = schedule[key]?.[s.id] || {};
    const updates = [];
    Object.entries(staffSchedule).forEach(([d, val]) => {
      if (typeof val === 'object' && val?.modified) {
        const { modified, ...rest } = val;
        let cleanedVal = Object.keys(rest).length === 1 && rest.type ? rest.type : rest;
        if (rest.type === '稼働' && typeof rest.hours === 'number') cleanedVal = rest.hours;
        updates.push({ staffId: s.id, day: Number(d), value: cleanedVal });
      }
    });
    if (updates.length > 0) updateShiftItems(year, month, updates);

    try {
      await chatService.sendApproval(
        s, 
        year, 
        month, 
        summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray), 
        irregularText, 
        remarks
      );
    } catch (e) { 
      // 【修正点】通知に失敗してもチェックは外さず、警告のみ表示する
      console.error("承認通知の送信に失敗しました:", e);
      alert(`チャットへの通知に失敗しましたが、シフトの承認とデータの確定は完了しました。\n(エラー詳細: ${e.message})`);
    }
  };

  const handleConfirmApprovalCancellation = () => {
    if (!approvalCancellationConfirmation) return;
    const { staffId } = approvalCancellationConfirmation;
    setStaff(prev => prev.map(x => x.id === staffId ? { 
      ...x, 
      shiftApproved: { ...x.shiftApproved, [key]: false } 
    } : x));
    setApprovalCancellationConfirmation(null);
  };

  // ==========================================
  // 4. 承認後の変更確定処理
  // ==========================================
  const handleFinalizeModification = async () => {
    const targetStaffIds = [...new Set(pendingChanges.map(c => c.staffId))];
    setIsLoading(true);
    setLoadingMessage('変更を確定し、一括通知を送信中...');
    
    try {
      const updatesToSave = [];
      const successfulStaffIds = [];

      for (const sId of targetStaffIds) {
        const staffChanges = pendingChanges.filter(c => c.staffId === sId);
        const targetStaff = staff.find(s => s.id === sId);
        if (!targetStaff) continue;

        const changeDetails = staffChanges.map(c => 
          `${c.rawMonth}/${c.day}: ${String(c.displayValue).replace(/\(undefined\)/g, '')}`
        ).join('\n');
        
        const dateSummary = staffChanges.map(c => c.day).join(', ');
        
        let mentions = '';
        if (adminConfig?.submissionNotificationIds) {
          mentions = adminConfig.submissionNotificationIds.split(',')
            .map(id => id.trim())
            .filter(id => id !== '')
            .map(id => `<users/${id}>`)
            .join(' ');
        }

        try {
            await chatService.sendChangeAfterApproval(
              targetStaff.name, 
              year, 
              month, 
              dateSummary, 
              changeDetails, 
              mentions
            );
        } catch (e) {
            console.warn(`通知送信エラー (${targetStaff.name}):`, e);
            // エラーを無視してデータ保存の処理に進む
        }
        
        successfulStaffIds.push(sId);

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

      setStaff(prev => prev.map(s => successfulStaffIds.includes(s.id) ? { 
        ...s, 
        shiftApproved: { ...s.shiftApproved, [key]: false } 
      } : s));
      
      if (updatesToSave.length > 0) {
        updateShiftItems(year, month, updatesToSave);
      }

      setPendingChanges([]);
      setShowModificationConfirm(false);

    } catch (error) {
      console.error("一括変更確定エラー:", error);
      alert(`処理中にエラーが発生しました。\n${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    pendingChanges, setPendingChanges,
    showModificationConfirm, setShowModificationConfirm,
    submissionConfirmation, setSubmissionConfirmation,
    remandConfirmation, setRemandConfirmation,
    approvalModalStaffId, setApprovalModalStaffId,
    absenceNotificationConfirmation, setAbsenceNotificationConfirmation,
    approvalCancellationConfirmation, setApprovalCancellationConfirmation,
    handleToggleShiftSubmitted, handleConfirmSubmission,
    handleToggleShiftRemanded, handleConfirmRemand,
    handleToggleShiftApproved, handleConfirmApproval, handleConfirmApprovalCancellation,
    handleFinalizeModification
  };
};
