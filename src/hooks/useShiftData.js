import { useState, useEffect } from 'react';
import { 
  initializeFirestoreData, subscribeMasters, subscribeStaff, subscribeMonthlySchedule,
  dbUpdateSchedule, dbUpdateStaff, dbAddStaff, dbDeleteStaff, 
  dbUpdateTask, dbUpdatePatterns, dbUpdateConfig, dbUpdateStaffShiftStatus
} from '../utils/firebaseDb';
import { initialStaffData, initialShiftPatterns, initialTasks, initialAdminConfig } from '../constants/initialData';

export const useShiftData = (currentYear, currentMonth) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved'); // 互換性のため残すが、基本即時保存
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  // 1. 初期化とマスタデータの購読
  useEffect(() => {
    let unsubMasters = () => {};
    let unsubStaff = () => {};

    const init = async () => {
      try {
        await initializeFirestoreData();
        
        unsubMasters = subscribeMasters(setTasks, setShiftPatterns, setAdminConfig);
        unsubStaff = subscribeStaff(setStaff);
        
        setInitialDataLoaded(true);
        setIsLoading(false);
      } catch (e) {
        console.error("Init Error:", e);
        setLoadingMessage("エラーが発生しました: " + e.message);
      }
    };

    init();

    return () => {
      unsubMasters();
      unsubStaff();
    };
  }, []);

  // 2. 月ごとのシフトデータの購読 (年・月が変わるたびに購読先を切り替え)
  useEffect(() => {
    if (!currentYear || !currentMonth) return;
    const unsubSchedule = subscribeMonthlySchedule(currentYear, currentMonth, setSchedule);
    return () => unsubSchedule();
  }, [currentYear, currentMonth]);

  // --- 更新用ラッパー関数（App.jsx互換用） ---

  const handleUpdateSchedule = async (year, month, staffId, day, value) => {
    setSaveStatus('saving');
    try {
      await dbUpdateSchedule(year, month, staffId, day, value);
      setSaveStatus('saved');
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
  };

  const handleUpdateStaffProperty = async (staffId, field, value) => {
    setSaveStatus('saving');
    try {
      await dbUpdateStaff(staffId, { [field]: value });
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus('error');
    }
  };

  const handleUpdateStaffFull = async (staffId, updatedData) => {
      setSaveStatus('saving');
      try {
        await dbUpdateStaff(staffId, updatedData);
        setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  const handleAddStaff = async (newStaff) => {
      setSaveStatus('saving');
      try {
          await dbAddStaff(newStaff);
          setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  const handleDeleteStaff = async (staffId) => {
      setSaveStatus('saving');
      try {
          await dbDeleteStaff(staffId);
          setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  const handleUpdateTasks = async (newTasks) => {
      setSaveStatus('saving');
      try {
          await dbUpdateTask(newTasks);
          // StateはonSnapshotで更新されるが、楽観的UIとして即時反映も可
          setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  const handleUpdatePatterns = async (newPatterns) => {
    setSaveStatus('saving');
    try {
        await dbUpdatePatterns(newPatterns);
        setSaveStatus('saved');
    } catch (e) { setSaveStatus('error'); }
  };

  const handleUpdateConfig = async (newConfig) => {
      setSaveStatus('saving');
      try {
          await dbUpdateConfig(newConfig);
          setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  const handleUpdateShiftStatus = async (staffId, field, year, month, value) => {
      setSaveStatus('saving');
      try {
          await dbUpdateStaffShiftStatus(staffId, field, year, month, value);
          setSaveStatus('saved');
      } catch (e) { setSaveStatus('error'); }
  };

  return {
    staff, schedule, tasks, shiftPatterns, adminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded,
    // Actions
    actions: {
        updateSchedule: handleUpdateSchedule,
        updateStaffProperty: handleUpdateStaffProperty,
        updateStaffFull: handleUpdateStaffFull,
        addStaff: handleAddStaff,
        deleteStaff: handleDeleteStaff,
        updateTasks: handleUpdateTasks,
        updatePatterns: handleUpdatePatterns,
        updateConfig: handleUpdateConfig,
        updateShiftStatus: handleUpdateShiftStatus
    }
  };
};
