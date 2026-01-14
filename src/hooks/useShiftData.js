import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { initialShiftPatterns, initialStaffData, initialAdminConfig, initialTasks } from '../constants/initialData';
import { generateInitialSchedule } from '../utils/scheduleUtils';

export const useShiftData = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("データベースに接続しています...");
  const [saveStatus, setSaveStatus] = useState('saved');
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // Main State
  const [staff, setStaff] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [tasks, setTasks] = useState([]);
  const [shiftPatterns, setShiftPatterns] = useState([]);
  const [adminConfig, setAdminConfig] = useState(initialAdminConfig);

  const scheduleDocRef = doc(db, "schedules", "main");
  const debouncedSave = useRef(null);
  const isInitialDataSync = useRef(true);

  // 1. Load Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const docSnap = await getDoc(scheduleDocRef);
        if (docSnap.exists()) {
          setLoadingMessage("データを読み込んでいます...");
          const data = docSnap.data();
          setStaff(data.staff || initialStaffData);
          setSchedule(data.schedule || generateInitialSchedule(initialStaffData, initialShiftPatterns));
          setTasks(data.tasks || initialTasks);
          setShiftPatterns(data.shiftPatterns || initialShiftPatterns);
          setAdminConfig(data.adminConfig || initialAdminConfig);
        } else {
          setLoadingMessage("初回セットアップを実行中...");
          const defaultState = {
            staff: initialStaffData,
            schedule: generateInitialSchedule(initialStaffData, initialShiftPatterns),
            tasks: initialTasks,
            shiftPatterns: initialShiftPatterns,
            adminConfig: initialAdminConfig
          };
          await setDoc(scheduleDocRef, defaultState);
          setStaff(defaultState.staff);
          setSchedule(defaultState.schedule);
          setTasks(defaultState.tasks);
          setShiftPatterns(defaultState.shiftPatterns);
          setAdminConfig(defaultState.adminConfig);
        }
      } catch (error) {
        console.error("Firebase Load Error:", error);
        setLoadingMessage(`エラー: ${error.message}`);
        return;
      }
      setInitialDataLoaded(true);
      setIsLoading(false);
    };
    loadData();
  }, []);

  // 2. Auto Save
  useEffect(() => {
    if (!initialDataLoaded) return;
    if (isInitialDataSync.current) {
      isInitialDataSync.current = false;
      return;
    }

    setSaveStatus('unsaved');
    if (debouncedSave.current) clearTimeout(debouncedSave.current);

    debouncedSave.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await setDoc(scheduleDocRef, { staff, schedule, tasks, shiftPatterns, adminConfig });
        setSaveStatus('saved');
      } catch (error) {
        console.error("Auto-save failed:", error);
        setSaveStatus('error');
      }
    }, 1500);

    return () => clearTimeout(debouncedSave.current);
  }, [staff, schedule, tasks, shiftPatterns, adminConfig, initialDataLoaded]);

  return {
    staff, setStaff,
    schedule, setSchedule,
    tasks, setTasks,
    shiftPatterns, setShiftPatterns,
    adminConfig, setAdminConfig,
    isLoading, loadingMessage, setLoadingMessage, setIsLoading,
    saveStatus, initialDataLoaded
  };
};
