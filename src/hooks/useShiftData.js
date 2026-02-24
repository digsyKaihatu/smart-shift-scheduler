import { useState, useEffect, useCallback } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';

// 既存の初期データインポート
import { initialStaff, initialTasks, initialShiftPatterns, initialAdminConfig } from '../constants/initialData';

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
        
        let currentStaff = initialStaff || [];
        if (masterSnap.exists()) {
          const data = masterSnap.data();
          if (data.staff) {
             currentStaff = data.staff;
             setStaff(currentStaff);
          }
          if (data.tasks) setTasks(data.tasks);
          if (data.shiftPatterns) setShiftPatterns(data.shiftPatterns);
          if (data.adminConfig) setAdminConfig(data.adminConfig);
        } else {
          setStaff(initialStaff || []);
          setTasks(initialTasks || []);
          setShiftPatterns(initialShiftPatterns || []);
          setAdminConfig(initialAdminConfig || {});
        }

        // 2. シフトスケジュールの取得
        const monthSchedule = {};
        
        // 旧フォーマット（月単位ドキュメント）の取得（後方互換性のため）
        const oldDocRef = doc(db, 'schedules', monthKey);
        const oldDocSnap = await getDoc(oldDocRef);
        if (oldDocSnap.exists()) {
          Object.assign(monthSchedule, oldDocSnap.data());
        }

        // 新フォーマット（スタッフ単位ドキュメント）の取得
        const staffSchedulePromises = currentStaff.map(async (s) => {
            const docRef = doc(db, 'schedules', `${monthKey}_${s.id}`);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                // 新フォーマットのデータがあれば、それで上書き
                monthSchedule[s.id] = { ...(monthSchedule[s.id] || {}), ...docSnap.data() };
            }
        });
        
        // 全スタッフのデータを並列取得
        await Promise.all(staffSchedulePromises);

        // 取得したデータをこれまでのフォーマットでStateにセット（UI/CSV影響回避）
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
    
    const timer = setTimeout(saveMasterData, 1000); // 連続保存を防ぐデバウンス
    return () => clearTimeout(timer);
  }, [staff, tasks, shiftPatterns, adminConfig, initialDataLoaded]);

  // -------------------------------------------------------------
  // シフトデータの更新（スタッフ単位で保存するように改修）
  // -------------------------------------------------------------

  // 単一セルの更新
  const updateShiftItem = useCallback(async (y, m, staffId, day, value) => {
    const targetMonthKey = `${y}-${m}`;
    
    // UIを即時反映（Stateは既存の構造を維持）
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

    // Firestoreへの保存（対象スタッフのドキュメントのみ更新）
    setSaveStatus('saving');
    try {
      const docRef = doc(db, 'schedules', `${targetMonthKey}_${staffId}`);
      await setDoc(docRef, { [day]: value }, { merge: true });
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

    // Firestoreへの保存（バッチ処理で複数スタッフのドキュメントを同時更新）
    setSaveStatus('saving');
    try {
      const batch = writeBatch(db);
      const updatesByStaff = {};
      
      // 更新データをスタッフごとに仕分け
      updates.forEach(update => {
         const { staffId, day, value } = update;
         if (!updatesByStaff[staffId]) updatesByStaff[staffId] = {};
         updatesByStaff[staffId][day] = value;
      });

      // スタッフごとにバッチ登録
      Object.entries(updatesByStaff).forEach(([staffId, days]) => {
          const docRef = doc(db, 'schedules', `${targetMonthKey}_${staffId}`);
          batch.set(docRef, days, { merge: true });
      });

      await batch.commit();
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
      const docRef = doc(db, 'schedules', `${targetMonthKey}_${staffId}`);
      await setDoc(docRef, monthData); 
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
