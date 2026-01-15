import { 
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, 
  onSnapshot, writeBatch, query, where 
} from "firebase/firestore";
import { db } from '../config/firebase';
import { initialStaffData, initialShiftPatterns, initialTasks, initialAdminConfig } from '../constants/initialData';

// コレクション参照の定義
const USERS_COL = collection(db, 'users');
const SCHEDULES_COL = collection(db, 'schedules');
const MASTERS_COL = collection(db, 'masters');

/**
 * 初期データの投入（Firestoreが空の場合のみ実行）
 */
export const initializeFirestoreData = async () => {
  const adminConfigRef = doc(MASTERS_COL, 'adminConfig');
  const snap = await getDoc(adminConfigRef);

  if (!snap.exists()) {
    const batch = writeBatch(db);

    // マスタデータの保存
    batch.set(doc(MASTERS_COL, 'adminConfig'), initialAdminConfig);
    batch.set(doc(MASTERS_COL, 'shiftPatterns'), { data: initialShiftPatterns });
    batch.set(doc(MASTERS_COL, 'tasks'), { data: initialTasks });

    // 初期スタッフの保存
    initialStaffData.forEach(staff => {
      const staffRef = doc(USERS_COL, staff.id);
      batch.set(staffRef, staff);
    });

    await batch.commit();
    console.log("初期データを構築しました。");
  }
};

/**
 * マスタデータの購読 (Tasks, Patterns, Config)
 */
export const subscribeMasters = (setTasks, setPatterns, setConfig) => {
  const unsubTasks = onSnapshot(doc(MASTERS_COL, 'tasks'), (doc) => {
    if (doc.exists()) setTasks(doc.data().data || []);
  });
  const unsubPatterns = onSnapshot(doc(MASTERS_COL, 'shiftPatterns'), (doc) => {
    if (doc.exists()) setPatterns(doc.data().data || []);
  });
  const unsubConfig = onSnapshot(doc(MASTERS_COL, 'adminConfig'), (doc) => {
    if (doc.exists()) setConfig(doc.data());
  });

  return () => {
    unsubTasks();
    unsubPatterns();
    unsubConfig();
  };
};

/**
 * スタッフ一覧の購読
 */
export const subscribeStaff = (setStaff) => {
  const q = query(USERS_COL); // 必要であればorderByを追加
  return onSnapshot(q, (snapshot) => {
    const staffList = snapshot.docs.map(d => d.data());
    setStaff(staffList);
  });
};

/**
 * 指定した月のシフトデータを購読
 */
export const subscribeMonthlySchedule = (year, month, setSchedule) => {
  const docId = `${year}-${month}`;
  return onSnapshot(doc(SCHEDULES_COL, docId), (docSnap) => {
    if (docSnap.exists()) {
      // { [staffId]: { [day]: value } } の形式でStateを更新
      setSchedule(prev => ({ ...prev, [docId]: docSnap.data() }));
    } else {
      // データが存在しない場合は空オブジェクトをセット
      setSchedule(prev => ({ ...prev, [docId]: {} }));
    }
  });
};

// --- 更新系アクション ---

export const dbUpdateSchedule = async (year, month, staffId, day, value) => {
  const docId = `${year}-${month}`;
  const docRef = doc(SCHEDULES_COL, docId);
  // ネストされたフィールドの更新: "staffId.day"
  // ドキュメントが存在しない場合に備えて setDoc with merge を使用
  await setDoc(docRef, {
    [staffId]: {
      [day]: value
    }
  }, { merge: true });
};

export const dbUpdateStaff = async (staffId, data) => {
  await updateDoc(doc(USERS_COL, staffId), data);
};

export const dbAddStaff = async (newStaff) => {
  await setDoc(doc(USERS_COL, newStaff.id), newStaff);
};

export const dbDeleteStaff = async (staffId) => {
  await deleteDoc(doc(USERS_COL, staffId));
};

export const dbUpdateTask = async (newTasks) => {
  await updateDoc(doc(MASTERS_COL, 'tasks'), { data: newTasks });
};

export const dbUpdatePatterns = async (newPatterns) => {
  await updateDoc(doc(MASTERS_COL, 'shiftPatterns'), { data: newPatterns });
};

export const dbUpdateConfig = async (newConfig) => {
  await updateDoc(doc(MASTERS_COL, 'adminConfig'), newConfig);
};

// スタッフのシフト提出状況などを更新する場合のヘルパー
// usersコレクションに持たせるか、schedulesに持たせるか悩ましいが、
// 頻繁に更新される "月単位のフラグ" なので users に持たせると更新頻度が高すぎる。
// schedulesドキュメントの特別なフィールド（例: `__meta`）に入れるか、
// userドキュメント内の `shiftStatus` マップに入れるのが妥当。
// ここでは既存の実装に合わせて Userドキュメント内の `shiftSubmitted` などを更新する。
export const dbUpdateStaffShiftStatus = async (staffId, field, year, month, value) => {
  const key = `${year}-${month}`;
  // field例: "shiftSubmitted", "shiftApproved"
  await updateDoc(doc(USERS_COL, staffId), {
    [`${field}.${key}`]: value
  });
};
