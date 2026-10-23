// 名字的禁用字詞過濾。index.html 裡有一份相同的 BAD_WORDS／normName（瀏覽器端先擋、給提示），
// 這裡是伺服器端最後一道關卡（有人繞過網頁直接連線也擋得住）。兩邊的清單要一起改。
//
// 比對前先「正規化」：轉小寫、全形轉半形、常見的數字／符號替代字母（f4ck、sh1t）還原、
// 去掉空白與標點（幹 你、f.u.c.k），再看有沒有包含清單裡的字詞。
// 刻意用詞組而不是單字（例如「幹你」而非「幹」），避免誤擋「能幹」「幹勁」這類正常名字。
export const BAD_WORDS = [
  // 英文
  'fuck', 'fuk', 'fck', 'fack', 'fvck', 'phuck', 'shit', 'bitch', 'asshole', 'dick', 'cock', 'pussy', 'cunt', 'nigger', 'nigga',
  'faggot', 'bastard', 'slut', 'whore', 'porn', 'sex', 'rape', 'nazi', 'hitler', 'wtf', 'admin',
  // 中文粗話（含簡體與常見諧音）
  '幹你', '幹妳', '幹林', '幹拎', '幹恁', '幹死', '干你', '干林', '操你', '操妳', '操死', '肏', '屌',
  '靠北', '靠杯', '靠腰', '靠夭', '他媽', '他妈', '你媽', '你妈', '媽的', '妈的', '林北', '林娘', '恁娘', '恁爸', '你娘',
  '機掰', '機八', '機歪', '雞掰', '雞巴', '雞歪', '鸡巴', '三小', '洨', '屄', '婊', '妓',
  '賤人', '贱人', '賤貨', '白痴', '白癡', '智障', '腦殘', '脑残', '傻逼', '傻b', '煞筆', '低能', '廢物', '废物', '去死',
  // 色情、暴力、歧視
  '色情', '淫', '性交', '做愛', '做爱', '強姦', '强奸', '強暴', '陰莖', '陰道', '打手槍', '尻槍',
  '吸毒', '毒品', '殺人', '自殺', '支那', '黑鬼', '納粹', '希特勒',
  // 冒充管理者
  '管理員', '管理员',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[0134579@$!|]/g, (c) => LEET[c] || c)
    .replace(/[^a-z㐀-鿿]/g, '');
}

export function hasBadWord(name) {
  const n = normName(name);
  return BAD_WORDS.some((w) => n.includes(normName(w)));
}
