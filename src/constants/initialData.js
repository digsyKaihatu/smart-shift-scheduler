// 基本シフトパターンの定義
export const initialShiftPatterns = [
  { id: 'A', name: 'A', startTime: '9:00', endTime: '18:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'B', name: 'B', startTime: '9:00', endTime: '17:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'C', name: 'C', startTime: '9:00', endTime: '17:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'D', name: 'D', startTime: '9:00', endTime: '16:30', breakTime: '1:00', workHours: 6.5 },
  { id: 'E', name: 'E', startTime: '9:00', endTime: '16:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'F', name: 'F', startTime: '9:00', endTime: '15:30', breakTime: '1:00', workHours: 5.5 },
  { id: 'G', name: 'G', startTime: '9:00', endTime: '15:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'H', name: 'H', startTime: '9:00', endTime: '13:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'I', name: 'I', startTime: '9:30', endTime: '18:30', breakTime: '1:00', workHours: 8.0 },
  { id: 'J', name: 'J', startTime: '9:30', endTime: '18:00', breakTime: '1:00', workHours: 7.5 },
  { id: 'K', name: 'K', startTime: '9:30', endTime: '17:30', breakTime: '1:00', workHours: 7.0 },
  { id: 'L', name: 'L', startTime: '9:30', endTime: '17:00', breakTime: '1:00', workHours: 6.5 },
  { id: 'M', name: 'M', startTime: '9:30', endTime: '16:30', breakTime: '1:00', workHours: 6.0 },
  { id: 'N', name: 'N', startTime: '9:30', endTime: '16:00', breakTime: '1:00', workHours: 5.5 },
  { id: 'O', name: 'O', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 },
  { id: 'P', name: 'P', startTime: '10:00', endTime: '18:30', breakTime: '1:00', workHours: 7.5 },
  { id: 'Q', name: 'Q', startTime: '10:00', endTime: '18:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'R', name: 'R', startTime: '10:00', endTime: '17:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'S', name: 'S', startTime: '10:00', endTime: '16:00', breakTime: '1:00', workHours: 5.0 },
  { id: 'T', name: 'T', startTime: '11:00', endTime: '20:00', breakTime: '1:00', workHours: 8.0 },
  { id: 'U', name: 'U', startTime: '13:00', endTime: '20:00', breakTime: '1:00', workHours: 6.0 },
  { id: 'V', name: 'V', startTime: '12:00', endTime: '20:00', breakTime: '1:00', workHours: 7.0 },
  { id: 'W', name: 'W', startTime: '13:30', endTime: '18:00', breakTime: '0:00', workHours: 4.5 },
  { id: 'X', name: 'X', startTime: '10:00', endTime: '14:00', breakTime: '0:00', workHours: 4.0 },
  { id: 'Y', name: 'Y', startTime: '10:00', endTime: '13:00', breakTime: '0:00', workHours: 3.0 },
  { id: 'Z', name: 'Z', startTime: '14:00', endTime: '20:00', breakTime: '1:00', workHours: 5.0 },
  { id: '@', name: '@', startTime: '14:30', endTime: '20:00', breakTime: '1:00', workHours: 4.5 },
  { id: '★', name: '★', startTime: '9:30', endTime: '15:30', breakTime: '1:00', workHours: 5.0 }
];

// hookが期待している変数名 "initialStaffData" に修正
export const initialStaffData = [
  {
    id: 'admin',
    name: '管理者',
    role: '管理者',
    employeeId: '000',
    email: 'admin@example.com',
    chatUserId: '',
    possibleTasks: ['t1', 't2', 't3'],
    defaultShift: { pattern: ['I', 'I', 'I', 'I', 'I'], hasBreak: true },
    shiftSubmitted: {},
    shiftRemanded: {},
    shiftApproved: {}
  }
];

export const initialTasks = [
  { id: 't1', name: '業務A', requiredPersonnel: 3 },
  { id: 't2', name: '業務B', requiredPersonnel: 2 },
  { id: 't3', name: '業務C', requiredPersonnel: 2 }
];

export const initialAdminConfig = {
    adminEmails: 'admin@example.com',
    submissionNotificationIds: ''
};
