import { useState, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { summarizePattern } from '../utils/scheduleUtils';
import { formatValue } from '../utils/dateUtils';

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
      // 既に提出済みの場合は即座に解除（通知なし）
      setStaff(prev => prev.map(x => x.id === staffId ? { 
        ...x, 
        shiftSubmitted: { ...x.shiftSubmitted, [key]: false } 
      } : x));
    } else {
      // 未提出の場合は確認モーダルを表示
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
    
    // UIを即座に更新してチェックを付ける
    setStaff(prev => prev.map(x => x.id === staffId ? { 
      ...x, 
      shiftSubmitted: { ...x.shiftSubmitted, [key]: true } 
    } : x));
    setSubmissionConfirmation(null);

    // バックグラウンドでチャット送信を実行
    try { 
      await chatService.sendSubmission(name, year, month, mentions); 
    } catch (e) { 
      console.error("提出通知の送信に失敗しました:", e);
      alert(`通信エラー: 通知の送信に失敗したため、チェックを元に戻しました。\n${e.message}`);
      // 送信失敗時はロールバック（チェックを外す）
      setStaff(prev => prev.map(x => x.id === staffId ? { 
        ...x, 
        shiftSubmitted: { ...x.shiftSubmitted, [key]: false } 
      } : x));
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
    
    // UIを即座に更新
    setStaff(prev => prev.map(x => x.id === staffId ? { 
      ...x, 
      shiftRemanded: { ...x.shiftRemanded, [key]: true } 
    } : x));
    setRemandConfirmation(null);

    try { 
      await chatService.sendRemand(name, s.chatUserId); 
    } catch (e) { 
      console.error("差戻通知の送信に失敗しました:", e);
      alert(`通信エラー: 通知の送信に失敗したため、チェックを元に戻しました。\n${e.message}`);
      setStaff(prev => prev.map(x => x.id === staffId ? { 
        ...x, 
        shiftRemanded: { ...x.shiftRemanded, [key]: false } 
      } : x));
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

    // UIを即座に更新
    setStaff(prev => prev.map(x => x.id === targetId ? { 
      ...x, 
      shiftApproved: { ...x.shiftApproved, [key]: true } 
    } : x));
    setApprovalModalStaffId(null);

    try {
      await chatService.sendApproval(
        s, 
        year, 
        month, 
        summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray), 
        irregularText, 
        remarks
      );
      
      // 送信成功後に「変更中(オレンジ)」フラグをクリアする
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

    } catch (e) { 
      console.error("承認通知の送信に失敗しました:", e);
      alert(`通信エラー: 通知の送信に失敗したため、チェックを元に戻しました。\n${e.message}`);
      setStaff(prev => prev.map(x => x.id === targetId ? { 
        ...x, 
        shiftApproved: { ...x.shiftApproved, [key]: false } 
      } : x));
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
  // 4. 承認後の変更確定処理（一括通知用）
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

        // 送信
        await chatService.sendChangeAfterApproval(
          targetStaff.name, 
          year, 
          month, 
          dateSummary, 
          changeDetails, 
          mentions
        );
        
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

      // 全て成功したら状態を更新（承認フラグを一度折って再承認待ちの状態にする、または運用に合わせる）
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
      alert(`通信エラー: 一部の通知送信に失敗したため処理を中断しました。\n${error.message}`);
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
