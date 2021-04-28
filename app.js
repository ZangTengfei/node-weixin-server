const express = require("express"), //express 框架
  wechat = require("./wechat/wechat"),
  config = require("./config"), //引入配置文件
  tenpay = require("tenpay"),
  bodyParser = require("body-parser"),
  http = require("http"),
  AV = require("leancloud-storage");

var app = express(); //实例express框架

var wechatApp = new wechat(config); //实例wechat 模块

const api = new tenpay(
  {
    appid: config.appID,
    mchid: config.mchid,
    partnerKey: config.partnerKey,
    pfx: require("fs").readFileSync("apiclient_cert1.pem"),
    notify_url: "https://megahealth.cn",
  },
  true
);

AV.init({
  appId: "RxNcxyqAbSXecBPou8llk4Kw-gzGzoHsz",
  appKey: "su4QVR8GO2qDb6aIXRwpGzoy",
  serverURL: "https://rxncxyqa.lc-cn-n1-shared.com",
});

app.use(bodyParser.text({ type: "*/xml" }));

// 托管静态文件
app.use(express.static("public"));

//用于处理所有进入 3000 端口 get 的连接请求
app.get("/", function (req, res) {
  wechatApp.auth(req, res);
});

//用于处理所有进入 3000 端口 post 的连接请求
app.post("/", function (req, res) {
  wechatApp.handleMsg(req, res);
});

app.post("/unifiedOrder", async (req, res) => {
  let { openId, goodsId, amount, size, referral } = req.query;

  let discount = 0,
    body,
    out_trade_no,
    total_fee,
    price,
    attach,
    goodsName,
    goods_tag,
    notify_url;

  const queryGoods = new AV.Query("goods");
  const goodsInfo = await queryGoods.get(goodsId);
  price = goodsInfo.get("price");
  goodsName = goodsInfo.get("name");

  if (referral) {
    const queryRef = new AV.Query("userinfo");
    const refInfo = await queryRef.get(referral);
    discount = refInfo.get("referralDiscount");
  }

  total_fee = amount * (price - discount);
  out_trade_no = "megaringsaleno" + new Date().getTime();
  attach = size;
  body = goodsName;
  goods_tag = discount;
  notify_url = "https://megahealth.cn";

  try {
    let result_prepay_id = await api.unifiedOrder({
      openid: openId,
      body, // 商品描述
      out_trade_no, // 内部订单号
      total_fee, // 金额（分）
      out_trade_no,
      attach,
      body,
      goods_tag,
      notify_url,
      // trade_type: "JSAPI", // 默认值
    });
    console.log(result_prepay_id);
    let result = await api.getPayParamsByPrepay({
      prepay_id: result_prepay_id.prepay_id,
    });
    console.log(result);
    res.send({
      ...{
        return_code: "SUCCESS",
        return_msg: "OK",
      },
      ...result,
    });
  } catch (err_code) {
    console.log(err_code + "");
    let e = err_code + "";
    res.send({
      return_code: "FAIL",
      return_msg: e,
    });
  }
});

//用于请求获取 access_token
app.get("/getAccessToken", function (req, res) {
  console.log("getAccessToken");
  wechatApp.getAccessToken().then(function (data) {
    res.send(data);
  });
});

// 用于请求获取userinfo
app.get("/wx_login", function (req, res) {
  console.log("wx_login");
  wechatApp.wxLogin(req, res);
});

app.get("/onLogin", function (req, res) {
  console.log("onLogin");
  wechatApp.wxLogin(req, res);
});

app.post("/send_message", function (req, res) {
  console.log("send_message");
  wechatApp.sendMessage(req, res);
});

app.get("/get_wx_access_token", function (req, res, next) {
  wechatApp.getWxAccessToken(req, res);
});

app.get("/get_wx_jssdk_config", function (req, res, next) {
  wechatApp.getWxJssdkConfig(req, res);
});

app.get("/send_tpl_msg", function (req, res, next) {
  wechatApp.sendTplMsg(req, res);
});

//监听3000端口
app.listen(3300);
