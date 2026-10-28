/**
 * 排除项的「大类 / 小类」目录。
 *
 * 设计要点：
 * - 服务端只认识一个扁平的 `exclude: string[]`，所以大类/小类不是新状态，
 *   而是「这组词是否都在 exclude 里」的派生视图——勾选大类＝整组词入库，取消＝整组词出库。
 * - 词表内全局唯一（下面的 assertUnique 在开发时会提示），
 *   否则取消某一大类会把别的大类也一起取消掉。
 */

export interface SubCategory {
  name: string
  words: string[]
}

export interface Category {
  id: string
  /** 导航栏上的短名 */
  name: string
  /** 大类卡片上的说明 */
  desc: string
  subs: SubCategory[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'muying',
    name: '母婴',
    desc: '奶粉、尿裤、童装童玩、孕产',
    subs: [
      {
        name: '孕产用品',
        words: ['孕妇', '孕期', '待产', '月子', '产妇', '待产包', '孕妇装', '防溢乳垫', '收腹带'],
      },
      {
        name: '奶粉喂养',
        words: ['奶粉', '配方奶', '一段奶粉', '二段奶粉', '三段奶粉', '1段奶粉', '2段奶粉', '3段奶粉', '奶瓶', '奶嘴', '吸奶器', '母乳', '断奶', '辅食', '婴儿米粉', '磨牙棒'],
      },
      {
        name: '纸尿裤湿巾',
        words: ['尿不湿', '尿裤', '纸尿裤', '拉拉裤', '尿片', '湿巾', '隔尿垫'],
      },
      {
        name: '童装童鞋',
        words: ['童装', '童鞋', '童袜', '儿童内衣', '口水巾', '学步鞋'],
      },
      {
        name: '玩具早教',
        words: ['玩具', '积木', '乐高', '拼图', '毛绒', '玩偶', '早教', '益智', '儿童绘本', '点读笔'],
      },
      {
        name: '婴儿车床',
        words: ['婴儿车', '学步车', '婴儿床', '摇篮', '腰凳', '婴儿背带', '安全座椅', '儿童座椅', '童车', '遛娃', '溜娃'],
      },
    ],
  },
  {
    id: 'beauty',
    name: '美妆个护',
    desc: '护肤、彩妆、香氛、洗护、口腔',
    subs: [
      {
        name: '护肤',
        words: ['面霜', '精华', '爽肤水', '面膜', '眼霜', '洁面', '防晒霜', '水乳'],
      },
      {
        name: '彩妆',
        words: ['口红', '唇釉', '粉底', '气垫', '眼影', '睫毛膏', '腮红', '遮瑕', '眉笔'],
      },
      {
        name: '香氛',
        words: ['香水', '香氛', '淡香'],
      },
      {
        name: '洗发护发',
        words: ['洗发水', '护发素', '发膜', '头皮', '染发', '烫发'],
      },
      {
        name: '身体口腔',
        words: ['沐浴露', '身体乳', '牙膏', '牙刷', '漱口水', '电动牙刷'],
      },
      {
        name: '女性护理',
        words: ['卫生巾', '护垫', '卫生棉条', '私护'],
      },
      {
        name: '剃须',
        words: ['剃须刀', '剃须泡', '男士护肤'],
      },
    ],
  },
  {
    id: 'outdoor',
    name: '户外',
    desc: '露营、骑行、钓鱼、徒步、球类、健身',
    subs: [
      {
        name: '露营',
        words: ['帐篷', '露营', '天幕', '睡袋', '防潮垫', '折叠椅', '户外炉', '营地车'],
      },
      {
        name: '骑行',
        words: ['自行车', '山地车', '公路车', '骑行服', '头盔', '码表'],
      },
      {
        name: '钓鱼',
        words: ['鱼竿', '鱼线', '鱼钩', '钓箱', '浮漂', '路亚'],
      },
      {
        name: '徒步登山',
        words: ['登山鞋', '冲锋衣', '登山包', '徒步', '速干', '护膝', '登山杖'],
      },
      {
        name: '球类',
        words: ['篮球', '足球', '羽毛球', '乒乓球', '网球', '排球', '球拍'],
      },
      {
        name: '健身',
        words: ['哑铃', '瑜伽', '拉力器', '跳绳', '健身垫', '跑步机', '筋膜枪'],
      },
      {
        name: '泳装水上',
        words: ['泳衣', '泳镜', '泳帽', '泳圈', '浮潜', '潜水'],
      },
    ],
  },
  {
    id: 'fashion',
    name: '服饰鞋包',
    desc: '女装、男装、内衣、鞋靴、箱包',
    subs: [
      {
        name: '女装',
        words: ['连衣裙', '半身裙', '卫衣', '衬衫', '针织衫', '风衣', '羽绒服', '大衣', '睡衣'],
      },
      {
        name: '男装',
        words: ['男装', '夹克', '休闲裤', '西服', 'polo'],
      },
      {
        name: '内衣袜',
        words: ['内衣', '文胸', '内裤', '打底裤', '丝袜', '袜子', '家居服'],
      },
      {
        name: '鞋靴',
        words: ['运动鞋', '板鞋', '老爹鞋', '帆布鞋', '靴子', '高跟鞋', '凉鞋', '拖鞋'],
      },
      {
        name: '箱包配饰',
        words: ['双肩包', '背包', '手提包', '单肩包', '拉杆箱', '行李箱', '腰带', '围巾', '帽子', '太阳镜'],
      },
    ],
  },
  {
    id: 'food',
    name: '食品饮料',
    desc: '乳制品、零食、酒水、生鲜、粮油',
    subs: [
      {
        name: '乳制品',
        words: ['牛奶', '鲜奶', '纯奶', '生牛乳', '巴氏杀菌', '酪蛋白', '水牛奶', '乳清', '高钙奶', '舒化', '特仑苏', '金典'],
      },
      {
        name: '零食',
        words: ['零食', '饼干', '薯片', '巧克力', '糖果', '坚果', '果干', '肉干', '辣条'],
      },
      {
        name: '饮料酒水',
        words: ['饮料', '可乐', '果汁', '咖啡', '茶叶', '白酒', '啤酒', '红酒', '气泡水'],
      },
      {
        name: '生鲜',
        words: ['牛排', '牛肉', '猪肉', '鸡肉', '海鲜', '大虾', '水果', '苹果', '榴莲', '车厘子'],
      },
      {
        name: '粮油调味',
        words: ['大米', '面粉', '食用油', '酱油', '食醋', '调味料', '火锅底料'],
      },
    ],
  },
  {
    id: 'home',
    name: '家居',
    desc: '家具、床品、厨具、收纳清洁、建材',
    subs: [
      {
        name: '家具',
        words: ['沙发', '床垫', '书桌', '餐桌', '衣柜', '椅子', '茶几', '床头柜'],
      },
      {
        name: '床品家纺',
        words: ['四件套', '被芯', '枕芯', '床单', '凉席', '毛毯', '毛巾'],
      },
      {
        name: '厨房用具',
        words: ['锅具', '炒锅', '电饭煲', '空气炸锅', '刀具', '餐具', '保温杯', '破壁机'],
      },
      {
        name: '收纳清洁',
        words: ['收纳', '收纳箱', '衣架', '拖把', '扫地', '洗衣液', '洗洁精', '垃圾袋', '纸巾', '抽纸', '卷纸'],
      },
      {
        name: '家装建材',
        words: ['灯具', '窗帘', '地板', '马桶', '花洒', '五金'],
      },
    ],
  },
  {
    id: 'digital',
    name: '数码家电',
    desc: '手机、电脑、影音、大小家电',
    subs: [
      {
        name: '手机通讯',
        words: ['手机', '手机壳', '充电宝', '数据线', '充电器', '蓝牙耳机', '无线耳机'],
      },
      {
        name: '电脑办公',
        words: ['笔记本', '平板', '显示器', '键盘', '鼠标', '硬盘', '打印机', '路由器'],
      },
      {
        name: '影音娱乐',
        words: ['电视', '投影', '音箱', '耳机', '相机', '麦克风'],
      },
      {
        name: '大小家电',
        words: ['冰箱', '洗衣机', '空调', '微波炉', '净水器', '吸尘器', '风扇', '加湿器'],
      },
      {
        name: '智能设备',
        words: ['智能手表', '手环', '无人机', '体脂秤'],
      },
    ],
  },
  {
    id: 'pet',
    name: '宠物',
    desc: '主粮、零食、宠物用品',
    subs: [
      {
        name: '主粮',
        words: ['猫粮', '狗粮', '宠物粮', '冻干', '猫罐头'],
      },
      {
        name: '零食营养',
        words: ['宠物零食', '猫条', '化毛膏', '营养膏'],
      },
      {
        name: '宠物用品',
        words: ['猫砂', '猫爬架', '狗窝', '猫窝', '牵引绳', '宠物尿垫', '猫抓板', '宠物玩具'],
      },
    ],
  },
  {
    id: 'health',
    name: '医药保健',
    desc: '保健品、医疗器械、常备药',
    subs: [
      {
        name: '保健品',
        words: ['维生素', '钙片', '鱼油', '益生菌', '蛋白粉', '胶原蛋白'],
      },
      {
        name: '医疗器械',
        words: ['血压计', '血糖仪', '体温计', '雾化器', '制氧机'],
      },
      {
        name: '常备药',
        words: ['感冒药', '退烧药', '创可贴', '医用口罩'],
      },
    ],
  },
  {
    id: 'auto',
    name: '汽车',
    desc: '车载电子、车载用品、养护',
    subs: [
      {
        name: '车载电子',
        words: ['行车记录仪', '车载支架', '车载充电器', '倒车影像'],
      },
      {
        name: '车载用品',
        words: ['座套', '脚垫', '方向盘套', '车膜', '车载冰箱'],
      },
      {
        name: '养护',
        words: ['机油', '轮胎', '洗车', '玻璃水', '雨刮'],
      },
    ],
  },
]

/** 所有大类的词：按大类聚合，去重 */
export function catWords(cat: Category): string[] {
  return [...new Set(cat.subs.flatMap((s) => s.words))]
}

/** 全部目录词 */
export const ALL_WORDS: string[] = [...new Set(CATEGORIES.flatMap(catWords))]

const WORD_INDEX = new Map<string, string>(ALL_WORDS.map((w) => [w, w]))

/** 是否属于目录里的某个大类/小类 */
export function inCatalog(word: string): boolean {
  return WORD_INDEX.has(word)
}

export type Tri = 'on' | 'off' | 'partial'

/** 一组词的勾选状态：全在＝on，全不在＝off，其余 partial */
export function groupState(words: string[], current: Iterable<string>): Tri {
  const set = current instanceof Set ? current : new Set(current)
  let hit = 0
  for (const w of words) if (set.has(w)) hit += 1
  if (hit === 0) return 'off'
  return hit === words.length ? 'on' : 'partial'
}

/** 打开/关闭一组词，返回新的 exclude 列表（保持原有顺序，新词追加到末尾） */
export function toggleWords(current: string[], words: string[], on: boolean): string[] {
  const set = new Set(current)
  if (on) {
    const next = [...current]
    for (const w of words) if (!set.has(w)) next.push(w)
    return next
  }
  const drop = new Set(words)
  return current.filter((w) => !drop.has(w))
}

/** 不在任何大类里的词，就是用户自己加的自定义关键词 */
export function customWords(current: string[]): string[] {
  return current.filter((w) => !inCatalog(w))
}

/** 目录里覆盖了多少个小类 */
export const SUB_COUNT = CATEGORIES.reduce((n, c) => n + c.subs.length, 0)
