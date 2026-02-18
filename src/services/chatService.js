import { formatValue } from '../utils/dateUtils'; 

// Google Chat Webhook URL (環境変数から取得)
const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_URL;

// 【デバッグ用】 環境変数の読み込み状況をコンソールに出力
// 開発者ツール(F12)のConsoleタブで確認してください
console.log("---------------------------------------------------");
console.log("[ChatService] 環境変数の確認:");
console.log("WEBHOOK_URL:", WEBHOOK_URL);
console.log("All Env Vars:", import.meta.env);
console.log("---------------------------------------------------");

/**
 * WebhookへのPOSTリクエストを送信するヘルパー関数
 * CORSエラー対策として、失敗時に no-cors モードでの再送を試みるロジックを含みます
 */
const postToChat = async (payload) => {
  if (!WEBHOOK_URL) {
    console.warn('⚠️ Google Chat Webhook URL が設定されていません。.envファイルを確認してください。');
    // アラートは開発中のみ表示し、本番環境等で邪魔にならないよう条件分岐することが望ましいですが、
    // 現在はテストフェーズのため表示させたままにします。
    alert('【開発者用警告】Google Chat Webhook URLが設定されていません。\n\n1. .envファイルはルートにありますか？\n2. サーバーを再起動しましたか？\n3. コンソールログを確認してください。');
    return;
  }

  const headers = { 'Content-Type': 'application/json; charset=UTF-8' };
  const body = JSON.stringify(payload);

  try {
    // まず標準的なリクエストを試みる
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      throw new Error(`Chat API responded with status: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("Chat Notification Error (Standard):", error);

    // CORSエラー（Failed to fetch）の可能性が高い場合、no-corsモードで再試行する
    // 注意: no-corsではレスポンスの中身を確認できず、Content-Typeヘッダーも送れないため
    // Google Chat側で正しく処理されない可能性がありますが、一部の環境での回避策として機能することがあります。
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.warn("CORSエラーの可能性があるため、no-corsモードで再送信を試みます...");
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors', // レスポンスを受け取らない設定
          headers: { 'Content-Type': 'text/plain' }, // no-corsではapplication/jsonが送れないためtext/plainにする
          body: body
        });
        console.log("no-corsモードでリクエストを送信しました (成功可否は不明)");
      } catch (retryError) {
        console.error("Chat Notification Error (Retry):", retryError);
        // 本番環境ではユーザーにアラートを出さない方が良いが、テスト中は出す
        alert(`通知の送信に失敗しました。\nCORSエラーの可能性があります。\n\n詳細: ${error.message}`);
      }
    }
  }
};

export const chatService = {
  /**
   * 承認通知を送信
   */
  async sendApproval(staff, year, month, patternSummary, irregularities, remarks) {
    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const title = `${year}年${month}月 シフト承認のお知らせ`;
    const subtitle = `${staff.name} さん`;

    const card = {
      cardsV2: [{
        cardId: "approval-card",
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/check_circle_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "基本シフトパターン",
              widgets: [{ textParagraph: { text: patternSummary } }]
            },
            {
              header: "特記事項 (パターンと異なる日)",
              widgets: [{ textParagraph: { text: irregularities } }]
            },
            {
              header: "管理者コメント",
              widgets: [{ textParagraph: { text: remarks || "なし" } }]
            },
            {
              widgets: [
                {
                  textParagraph: {
                    text: `${mention} \n上記内容でシフトが確定しました。ご確認ください。`
                  }
                }
              ]
            }
          ]
        }
      }]
    };

    await postToChat(card);
  },

  /**
   * シフト変更通知を送信（承認済みシフトの修正時）
   */
  async sendShiftChange(staff, year, month, day, oldValue, newValue) {
    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const dateStr = `${year}/${month}/${day}`;
    
    // 表示用に値を整形
    const displayOld = oldValue || '(未入力)';
    const displayNew = newValue || '(削除)';

    const card = {
      cardsV2: [{
        cardId: `change-card-${Date.now()}`,
        card: {
          header: {
            title: "シフト変更のお知らせ",
            subtitle: `${staff.name} さん (承認済みシフトの変更)`,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/edit_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "管理者からの変更通知", // セクションヘッダーを追加
              widgets: [
                {
                  decoratedText: {
                    topLabel: "変更日",
                    text: dateStr,
                    startIcon: { knownIcon: "CALENDAR_TODAY" }
                  }
                },
                {
                  decoratedText: {
                    topLabel: "変更内容",
                    text: `${displayOld} ➔ <font color=\"#ff0000\">${displayNew}</font>`,
                    startIcon: { knownIcon: "DESCRIPTION" }
                  }
                },
                {
                  textParagraph: {
                    text: `${mention} \n承認後のシフトに変更がありました。上記内容をご確認ください。`
                  }
                }
              ]
            }
          ]
        }
      }]
    };

    await postToChat(card);
  },

  /**
   * 提出通知
   */
  async sendSubmission(name, year, month, mentions) {
    await postToChat({
      text: `${mentions} \n${name}さんが${year}年${month}月のシフトを提出しました。確認をお願いします。`
    });
  },

  /**
   * 差戻通知
   */
  async sendRemand(name, chatUserId) {
    const mention = chatUserId ? `<users/${chatUserId}>` : '';
    await postToChat({
      text: `${mention} \n${name}さんのシフトが差し戻されました。修正して再提出してください。`
    });
  },

  /**
   * 欠勤通知
   */
  async sendAbsence(name) {
    await postToChat({
      text: `【欠勤連絡】\n本日は ${name} さんが欠勤となります。業務調整をお願いします。`
    });
  }
};
