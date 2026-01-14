/**
 * 日本の祝日を取得する（簡易版ロジック）
 */
export const getJapaneseHolidays = (year, month) => {
  // 実際の実装はプロジェクトの既存コードに依存しますが、
  // ビルドエラー回避のために関数として定義しエクスポートします。
  // 必要に応じて詳細な祝日判定ロジックを追加してください。
  return []; 
};

/**
 * 閲覧モードでの表記を短縮するヘルパー関数
 */
export const formatValue = (value) => {
  const mapping = {
    'シフト休': '休',
    '欠勤': '欠',
    '通休': '通',
    '有休': '有',
    '遅刻': '遅',
    '早退': '早'
  };

  if (typeof value === 'number') {
    return value % 1 === 0 ? Math.floor(value) : value.toFixed(1);
  }

  // オブジェクト形式（時間単位の休暇など）の場合
  if (value && typeof value === 'object' && 'type' in value) {
    let displayType = value.type;
    // 完全一致での置換
    if (mapping[value.type]) {
      displayType = mapping[value.type];
    } else {
      // 部分一致（午前有休 -> 午前有 など）の置換
      Object.entries(mapping).forEach(([full, short]) => {
        displayType = displayType.replace(full, short);
      });
    }

    if ('locked' in value) {
      return displayType;
    }
    return `${displayType}(${value.hours})`;
  }

  // 文字列の場合
  if (typeof value === 'string') {
    return mapping[value] || value;
  }

  return value;
};
