import { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// 既存の初期データインポート
import * as initData from '../constants/initialData';

export const useShiftData = (year, month) => {
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(null);
  const [schedule, setSchedule] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('データを読み込み中...');
  const [saveStatus, setSaveStatus] = useState('saved'); 
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  const monthKey = `${year}-${month}`;

  // データの読み込み
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. マスタデータの取得
        const masterRef = doc(db, 'master', 'settings');
        const masterSnap = await getDoc(masterRef);
        
        // 本番環境の `initialData.js` の名前に合わせて取得
        const defaultStaff = initData.initialStaffData || initData.initialStaff || [];
        const defaultTasks = initData.initialTasks || [];
        const defaultPatterns = initData.initialShiftPatterns || [];
        const defaultAdminConfig = initData.initialAdminConfig || { adminEmails: "admin@example.com", submissionNotificationIds: "" };

        let currentStaff = defaultStaff;
        if (masterSnap.exists()) {
          const data = masterSnap.data();
          
          // ★復元ロジック：データが空配列で上書きされてしまっている場合はデフォルトデータで復元する
          currentStaff = (data.staff && data.staff.length > 0) ? data.staff : defaultStaff;
          setStaff(currentStaff);
          
          setTasks((data.tasks && data.tasks.length > 0) ? data.tasks : defaultTasks);
          setShiftPatterns((data.shiftPatterns && data.shiftPatterns.length > 0) ? data.shiftPatterns : defaultPatterns);
          
          // ★管理者権限の復元：adminEmailsが消えている場合はデフォルトで復元する
          const isAdminValid = data.adminConfig && data.adminConfig.adminEmails && data.adminConfig.adminEmails.trim() !== "";
          setAdminConfig(isAdminValid ? data.adminConfig : defaultAdminConfig);
        } else {
          setStaff(defaultStaff);
          setTasks(defaultTasks);
          setShiftPatterns(defaultPatterns);
          setAdminConfig(defaultAdminConfig);
        }

        // 2. シフトスケジュールの取得
        const monthSchedule = {};
        const docRef = doc(db, 'schedules', monthKey);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          Object.assign(monthSchedule, docSnap.data());
        }

        // ★手動追加メンバーの復元：マスタから消えてしまったが、シフトデータには存在しているメンバーを拾い上げる
        const scheduleStaffIds = Object.keys(monthSchedule);
        const missingStaffIds = scheduleStaffIds.filter(id => !currentStaff.some(s => s.id === id));
        
        if (missingStaffIds.length > 0) {
            const restoredStaff = missingStaffIds.map(id => ({
                id,
                name: `復元されたメンバー (${id.substring(0, 4)})`, // 名前は失われているため仮の名前
                employeeId: `EMP-${id.substring(0, 4)}`,
                role: 'OP',
                possibleTasks: [],
                defaultShift: { pattern: ['I','I','I','I','I'], hasBreak: true },
                shiftSubmitted: {}, shiftRemanded: {}, shiftApproved: {}
            }));
            currentStaff = [...currentStaff, ...restoredStaff];
            setStaff(currentStaff);
        }

        setSchedule(prev => ({ ...prev, [monthKey]: monthSchedule }));
        setInitialDataLoaded(true);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [year, month, monthKey]);

  // マスタデータの自動保存（変更検知時）
  useEffect(() => {
    if (!initialDataLoaded) return;
    const saveMasterData = async () => {
      setSaveStatus('saving');
      try {
        await setDoc(doc(db, 'master', 'settings'), {
          staff, tasks, shiftPatterns, adminConfig
        }, { merge: true });
        setSaveStatus('saved');
      } catch (error) {
        console.error("Error saving master data:", error);
        setSaveStatus('error');
      }
    };
    
    const timer = setTimeout(saveMasterData, 1000); 
    return () => clearTimeout(timer);
  }, [staff, tasks, shiftPatterns, adminConfig, initialDataLoaded]);

  // -------------------------------------------------------------
  // シフトデータの更新（表示は全員、更新は選択されたメンバーのみ）
  // -------------------------------------------------------------

  // 単一セルの更新
  const updateShiftItem = useCallback(async (y, m, staffId, day, value) => {
    const targetMonthKey = `${y}-${m}`;
    
    // UIを即時反映
    setSchedule(prev => {
      const currentMonth = prev[targetMonthKey] || {};
      const currentStaffSchedule = currentMonth[staffId] || {};
      return {
        ...prev,
        [targetMonthKey]: {
          ...currentMonth,
          [staffId]: { ...currentStaffSchedule, [day]: value }
        }
      };
    });

    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'schedules', targetMonthKey);
      // { merge: true } により、他のメンバーのデータは消えずに、指定したメンバーの日付のみが更新されます
      await setDoc(docRef, { 
          [staffId]: { [day]: value } 
      }, { merge: true });
      setSaveStatus('saved');
    } catch (error) {
      console.error("Error updating shift item:", error);
      setSaveStatus('error');
    }
  }, []);

  // 複数セルの一括更新（基本パターン適用、範囲削除など）
  const updateShiftItems = useCallback(async (y, m, updates) => {
    const targetMonthKey = `${y}-${m}`;
    
    // UIを即時反映
    setSchedule(prev => {
      const newSchedule = { ...prev };
      const currentMonth = { ...(newSchedule[targetMonthKey] || {}) };
      
      updates.forEach(update => {
        const { staffId, day, value } = update;
        currentMonth[staffId] = { ...(currentMonth[staffId] || {}), [day]: value };
      });
      newSchedule[targetMonthKey] = currentMonth;
      return newSchedule;
    });

    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'schedules', targetMonthKey);
      const updatesByStaff = {};
      
      // 更新データをスタッフごとに仕分け
      updates.forEach(update => {
         const { staffId, day, value } = update;
         if (!updatesByStaff[staffId]) updatesByStaff[staffId] = {};
         updatesByStaff[staffId][day] = value;
      });

      // 操作されたスタッフのデータだけをマージ保存（他人のデータは無事）
      await setDoc(docRef, updatesByStaff, { merge: true });
      setSaveStatus('saved');
    } catch (error) {
      console.error("Error batch updating shift items:", error);
      setSaveStatus('error');
    }
  }, []);

  // スタッフ1ヶ月分の丸ごと更新
  const updateShiftUserMonth = useCallback(async (y, m, staffId, monthData) => {
    const targetMonthKey = `${y}-${m}`;

    setSchedule(prev => ({
      ...prev,
      [targetMonthKey]: { ...(prev[targetMonthKey] || {}), [staffId]: monthData }
    }));

    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'schedules', targetMonthKey);
      await setDoc(docRef, {
          [staffId]: monthData
      }, { merge: true }); 
      setSaveStatus('saved');
    } catch (error) {
      console.error("Error updating user month schedule:", error);
      setSaveStatus('error');
    }
  }, []);

  return {
    staff, setStaff,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    schedule, setSchedule,
    updateShiftItem,
    updateShiftItems,
    updateShiftUserMonth,
    isLoading, setIsLoading,
    loadingMessage, setLoadingMessage,
    saveStatus,
    initialDataLoaded
  };
};
