/** 通ルールの定数。F = 1/60 秒。出典は設計書 §4 と §12 */
export const TSU = {
  /** 自然落下: 1段に何Fかかるか（推測: 旧ぷよ通） */
  GRAVITY_FRAMES: 16,
  /** ソフトドロップ: 1段に何F（実測から逆算） */
  SOFT_DROP_FRAMES: 2,
  /** 横移動の長押し: 最初のリピートまで（推測） */
  DAS: 8,
  /** 横移動の長押し: リピート間隔（推測） */
  ARR: 2,
  /** 接地してから固定されるまで（推測） */
  LOCK_DELAY: 32,
  /** 床蹴りで持ち上がるのがこの回数に達したら即固定（推測） */
  MAX_FLOOR_KICKS: 8,
  /** 1手目だけ開始前に足すF（実測） */
  FIRST_SPAWN_EXTRA: 7,
  /** 消去にかかるF（実測） */
  CLEAR_FRAMES: 55,
  /** 連鎖後の落下: 25 + 2×(段数−1)（実測と一致するモデル） */
  DROP_BASE: 25,
  DROP_PER_ROW: 2,
  /** ちぎりの追加F。index = 段差（実測） */
  CHIGIRI_EXTRA: [0, 19, 24, 28, 31, 34, 37, 40, 42, 44, 46, 48, 50, 52],
  SPAWN_X: 3,
  SPAWN_Y: 12,
  /** 窒息点 */
  DEATH_X: [3] as number[],
  DEATH_Y: 12,
  /** おじゃまレート（初期値） */
  RATE: 70,
  /** マージンタイムの開始と間隔（F） */
  MARGIN_START_FRAMES: 96 * 60,
  MARGIN_STEP_FRAMES: 16 * 60,
  /** マージンタイムでレートが下がる回数の上限 */
  MARGIN_MAX_STEPS: 14,
  /** 1回に降るおじゃまの上限 */
  MAX_GARBAGE_DROP: 30,
  /** 全消しの次の連鎖に足すおじゃま */
  ALL_CLEAR_BONUS: 30,
  /** おじゃまが1段目に着地するまでのF（1〜6列目、実測） */
  GARBAGE_LAND_FRAMES: [60, 59, 64, 56, 62, 58],
  /** 積まれている段1つにつき着地が早くなるF（推測） */
  GARBAGE_LAND_PER_ROW: 2,
  /** 設置が確定してから次の処理（ちぎり・消去判定）まで（Task 4 で実測に合わせて決める） */
  LOCK_ANIM_FRAMES: 0,
  /** 連鎖・ちぎりが終わってから次のツモが出るまで（Task 4 で実測に合わせて決める） */
  NEXT_DELAY: 27,
};

export type Rules = typeof TSU;
