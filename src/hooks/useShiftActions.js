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

  // 1
