'use strict' //设置为严格模式

const crypto = require('crypto'), //引入加密模块
      axios = require('axios'),
  https = require('https'), //引入 htts 模块
  util = require('util'), //引入 util 工具包
  fs = require('fs'), //引入 fs 模块
  urltil = require('url'),//引入 url 模块
  accessTokenJson = require('./access_token'), //引入本地存储的 access_token
  jsapiTicketJson = require('./jsapi_ticket'), //引入本地存储的 jsapi_ticket
  menus = require('./menus'), //引入微信菜单配置
  parseString = require('xml2js').parseString,//引入xml2js包
  msg = require('./msg'),//引入消息处理模块
  request = require('request'),
  CryptoGraphy = require('./cryptoGraphy'); //微信消息加解密模块


/**
 * 构建 WeChat 对象 即 js中 函数就是对象
 * @param {JSON} config 微信配置文件 
 */
var WeChat = function (config) {
  //设置 WeChat 对象属性 config
  this.config = config;
  //设置 WeChat 对象属性 token
  this.token = config.token;
  //设置 WeChat 对象属性 appID
  this.appID = config.appID;
  //设置 WeChat 对象属性 appScrect
  this.appScrect = config.appScrect;
  //设置 WeChat 对象属性 apiDomain
  this.apiDomain = config.apiDomain;
  //设置 WeChat 对象属性 apiURL
  this.apiURL = config.apiURL;

  /**
   * 用于处理 https Get请求方法
   * @param {String} url 请求地址 
   */
  this.requestGet = function (url) {
    return new Promise(function (resolve, reject) {
      https.get(url, function (res) {
        var buffer = [], result = "";
        //监听 data 事件
        res.on('data', function (data) {
          buffer.push(data);
        });
        //监听 数据传输完成事件
        res.on('end', function () {
          result = Buffer.concat(buffer).toString('utf-8');
          //将最后结果返回
          resolve(result);
        });
      }).on('error', function (err) {
        reject(err);
      });
    });
  }

  /**
   * 用于处理 https Post请求方法
   * @param {String} url  请求地址
   * @param {JSON} data 提交的数据
   */
  this.requestPost = function (url, data) {
    return new Promise(function (resolve, reject) {
      //解析 url 地址
      var urlData = urltil.parse(url);
      //设置 https.request  options 传入的参数对象
      var options = {
        //目标主机地址
        hostname: urlData.hostname,
        //目标地址 
        path: urlData.path,
        //请求方法
        method: 'POST',
        //头部协议
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data, 'utf-8')
        }
      };
      var req = https.request(options, function (res) {
        var buffer = [], result = '';
        //用于监听 data 事件 接收数据
        res.on('data', function (data) {
          buffer.push(data);
        });
        //用于监听 end 事件 完成数据的接收
        res.on('end', function () {
          result = Buffer.concat(buffer).toString('utf-8');
          resolve(result);
        })
      })
        //监听错误事件
        .on('error', function (err) {
          console.log(err);
          reject(err);
        });
      //传入数据
      req.write(data);
      req.end();
    });
  }
}

/**
 * 微信接入验证
 * @param {Request} req Request 对象
 * @param {Response} res Response 对象
 */
WeChat.prototype.auth = function (req, res) {

  var that = this;
  this.getAccessToken().then(function (data) {
    //格式化请求连接
    var url = util.format(that.apiURL.createMenu, that.apiDomain, data);
    //使用 Post 请求创建微信菜单
    that.requestPost(url, JSON.stringify(menus)).then(function (data) {
      //将结果打印
      console.log(data);
    });
  });

  //1.获取微信服务器Get请求的参数 signature、timestamp、nonce、echostr
  var signature = req.query.signature,//微信加密签名
    timestamp = req.query.timestamp,//时间戳
    nonce = req.query.nonce,//随机数
    echostr = req.query.echostr;//随机字符串

  //2.将token、timestamp、nonce三个参数进行字典序排序
  var array = [this.token, timestamp, nonce];
  array.sort();

  //3.将三个参数字符串拼接成一个字符串进行sha1加密
  var tempStr = array.join('');
  const hashCode = crypto.createHash('sha1'); //创建加密类型 
  var resultCode = hashCode.update(tempStr, 'utf8').digest('hex'); //对传入的字符串进行加密

  //4.开发者获得加密后的字符串可与signature对比，标识该请求来源于微信
  if (resultCode === signature) {
    res.send(echostr);
  } else {
    res.send('mismatch');
  }
}

/**
 * 获取微信全局 access_token
 */
WeChat.prototype.getAccessToken = function () {
  var that = this;
  return new Promise(function (resolve, reject) {
    //获取当前时间 
    var currentTime = new Date().getTime();
    //格式化请求地址
    var url = util.format(that.apiURL.accessTokenApi, that.apiDomain, that.appID, that.appScrect);
    //判断 本地存储的 access_token 是否有效
    if (accessTokenJson.access_token === "" || accessTokenJson.expires_time < currentTime) {
      that.requestGet(url).then(function (data) {
        var result = JSON.parse(data);
        if (data.indexOf("errcode") < 0) {
          accessTokenJson.access_token = result.access_token;
          accessTokenJson.expires_time = new Date().getTime() + (parseInt(result.expires_in) - 200) * 1000;
          //更新本地存储的
          fs.writeFileSync('./wechat/access_token.json', JSON.stringify(accessTokenJson));
          //将获取后的 access_token 返回
          resolve(accessTokenJson.access_token);
        } else {
          //将错误返回
          resolve(result);
        }
      });
    } else {
      //将本地存储的 access_token 返回
      resolve(accessTokenJson.access_token);
    }
  });
}

/**
 * 获取微信全局 jssdk_ticket
 */
WeChat.prototype.getJssdkTicket = function () {
  var that = this;
  return new Promise(function (resolve, reject) {
    //获取当前时间 
    var currentTime = new Date().getTime();
    that.getAccessToken().then(function(data) {
      var url = util.format(that.apiURL.jssdkTicketApi, that.apiDomain, data);
      //判断 本地存储的 access_token 是否有效
      if (jsapiTicketJson.jssdk_ticket === "" || jsapiTicketJson.expires_time < currentTime) {
        that.requestGet(url).then(function (data) {
          var result = JSON.parse(data);
          if (data.indexOf("errcode") < 0) {
            jsapiTicketJson.jssdk_ticket = result.jssdk_ticket;
            jsapiTicketJson.expires_time = new Date().getTime() + (parseInt(result.expires_in) - 200) * 1000;
            //更新本地存储的
            fs.writeFile('./wechat/jsapi_ticket.json', JSON.stringify(jsapiTicketJson));
            //将获取后的 access_token 返回
            resolve(jsapiTicketJson.jssdk_ticket);
          } else {
            //将错误返回
            resolve(result);
          }
        });
      } else {
        //将本地存储的 access_token 返回
        resolve(jsapiTicketJson.jssdk_ticket);
      }
    });
  });
}

/**
 * 微信消息处理
 * @param {Request} req Request 对象
 * @param {Response} res Response 对象
 */
WeChat.prototype.handleMsg = function (req, res) {
  var buffer = [], that = this;

  //实例微信消息加解密
  var cryptoGraphy = new CryptoGraphy(that.config, req);

  //监听 data 事件 用于接收数据
  req.on('data', function (data) {
    buffer.push(data);
  });
  //监听 end 事件 用于处理接收完成的数据
  req.on('end', function () {
    var msgXml = Buffer.concat(buffer).toString('utf-8');
    //解析xml
    parseString(msgXml, { explicitArray: false }, function (err, result) {
      if (!err) {
        result = result.xml;
        //判断消息加解密方式
        if (req.query.encrypt_type == 'aes') {
          //对加密数据解密
          result = cryptoGraphy.decryptMsg(result.Encrypt);
        }
        var toUser = result.ToUserName; //接收方微信
        var fromUser = result.FromUserName;//发送仿微信
        var reportMsg = ""; //声明回复消息的变量   

        //判断消息类型
        if (result.MsgType.toLowerCase() === "event") {
          //判断事件类型
          switch (result.Event.toLowerCase()) {
            case 'subscribe':
              //回复消息
              var content = "欢迎关注兆观信息！";
              reportMsg = msg.txtMsg(fromUser, toUser, content);
              break;
            case 'click':
              // var contentArr = [
              //   { Title: "Node.js 微信自定义菜单", Description: "使用Node.js实现自定义微信菜单", PicUrl: "http://img.blog.csdn.net/20170605162832842?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72868520" },
              //   { Title: "Node.js access_token的获取、存储及更新", Description: "Node.js access_token的获取、存储及更新", PicUrl: "http://img.blog.csdn.net/20170528151333883?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72783631" },
              //   { Title: "Node.js 接入微信公众平台开发", Description: "Node.js 接入微信公众平台开发", PicUrl: "http://img.blog.csdn.net/20170605162832842?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72765279" }
              // ];
              //回复图文消息
              // reportMsg = msg.graphicMsg(fromUser, toUser, contentArr);
              reportMsg = msg.txtMsg(fromUser,toUser,'杭州兆观传感科技有限公司 上海兆观信息科技有限公司 400电话：400-806-2265');
              break;
          }
        } else {
          //判断消息类型为 文本消息
          if (result.MsgType.toLowerCase() === "text") {
            //根据消息内容返回消息信息
            switch (result.Content) {
              case '使用指南':
                  reportMsg = msg.txtMsg(fromUser,toUser,'Hello ！我的英文名字叫 H-VK');
              break;
              case '联系方式':
                  reportMsg = msg.txtMsg(fromUser,toUser,'杭州兆观传感科技有限公司 上海兆观信息科技有限公司 400电话：400-806-2265');
              break;
              case '文章':
                var contentArr = [
                  { Title: "Node.js 微信自定义菜单", Description: "使用Node.js实现自定义微信菜单", PicUrl: "http://img.blog.csdn.net/20170605162832842?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72783631" },
                  { Title: "Node.js access_token的获取、存储及更新", Description: "Node.js access_token的获取、存储及更新", PicUrl: "http://img.blog.csdn.net/20170528151333883?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72783631" },
                  { Title: "Node.js 接入微信公众平台开发", Description: "Node.js 接入微信公众平台开发", PicUrl: "http://img.blog.csdn.net/20170605162832842?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvaHZrQ29kZXI=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast", Url: "http://blog.csdn.net/hvkcoder/article/details/72765279" }
                ];
                //回复图文消息
                reportMsg = msg.graphicMsg(fromUser, toUser, contentArr);
                break;
              default:
                reportMsg = msg.txtMsg(fromUser, toUser, '没有这个选项哦');
                break;
            }
          }
        }
        //判断消息加解密方式，如果未加密则使用明文，对明文消息进行加密
        reportMsg = req.query.encrypt_type == 'aes' ? cryptoGraphy.encryptMsg(reportMsg) : reportMsg;
        //返回给微信服务器
        res.send(reportMsg);

      } else {
        //打印错误
        console.log(err);
      }
    });
  });
}

/**
 * 获取微信用户信息 code
 */
WeChat.prototype.wxLogin = function (req, res) {
  // var that = this;
  // var router = 'get_wx_access_token';
  // var return_uri = 'http%3A%2F%2F801b5b30.ngrok.io%2F' + router;
  // var scope = 'snsapi_userinfo';
  // var url = util.format(that.apiURL.getCodeApi, that.apiDomain, that.appID, return_uri, scope);
  // res.redirect(url);
  // res.redirect('https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + that.appID + '&redirect_uri=' + return_uri + '&response_type=code&scope=' + scope + '&state=STATE#wechat_redirect');
  var that = this;
  var code = req.query.code;
  var url = util.format(that.apiURL.code2Session, that.apiDomain, that.appID, that.appScrect, code);
  axios.get(url).then(function(r) {
    console.log(r.data);
    res.send(r.data);
  }, function(err) {
    console.log(err);
    res.send('err');
    
  })
}

WeChat.prototype.sendMessage = function (req, res) {
  var that = this;
const hasBody = function(req) {
	return  'transfer-encoding'  in  req.headers  ||  'content-length' in req.headers;
};

const mime = function (req) {
  const str = req.headers['content-type'] || '';
  return str.split(';')[0];
};
  const isJson = mime(req) === 'application/json'
  if (hasBody(req) && isJson) {
    var buffers = [];
    req.on('data', function (chunk) {
      buffers.push(chunk);
    });
    req.on('end', function () {
      let requestBody = Buffer.concat(buffers).toString();
      try {
        requestBody = JSON.parse(requestBody);
        
        
          
          var openid = requestBody.openid;
          var template_id = requestBody.template_id;


          that.getAccessToken().then(function (data) {
            var requestData =  {
              "touser": openid,
              "template_id": template_id,         
              "data": {
                "thing1": {
                    "value": "高数"
                },
                "time5": {
                    "value": "10:00"
                },
                "thing6": {
                    "value": "二教-2201"
                } ,
                "thing7": {
                    "value": "微积分"
                }
              }
            }

            var url = util.format(that.apiURL.sendMsg, that.apiDomain, data);
            axios.post(url, requestData).then(function(r) {
              console.log(r.data);
              res.send(r.data)
            }, function(err) {
              console.log(err);
              res.send(err)
            })
          }, function(err) {
            console.log(err);
            res.send(err)
          });


      } catch (error) {
        console.log(error)
      }
    });
  }

  

}

/**
 * 网页授权，获取微信用户信息 access_token openId userInfo
 */
WeChat.prototype.getWxAccessToken = function (req, res) {
  var that = this;
  var code = req.query.code;
  var url = util.format(that.apiURL.webAccessTokenApi, that.apiDomain, that.appID, that.appScrect, code);
  request.get(
    {
      url: url
    },
    function (error, response, body) {
      if (response.statusCode == 200) {
        // 第三步：拉取用户信息(需scope为 snsapi_userinfo)
        var data = JSON.parse(body);
        var access_token = data.access_token;
        var openid = data.openid;
        var url = util.format(that.apiURL.getUserInfoApi, that.apiDomain, access_token, openid);
        request.get(
          {
            url: url
          },
          function (error, response, body) {
            if (response.statusCode == 200) {
              // 第四步：根据获取的用户信息进行对应操作
              var userinfo = JSON.parse(body);
              res.send(userinfo);
            } else {
              console.log(response.statusCode);
            }
          }
        );
      } else {
        console.log(response.statusCode);
      }
    }
  );
}

/**
 * 计算供前端页面调用JS-SDK接口配置config
 */
WeChat.prototype.getWxJssdkConfig = function (req, res) {
  var that = this;
  this.getJssdkTicket().then(function (data) {
    if(data.errmsg == 'ok') {
      var jsapi_ticket = data.ticket;
      var noncestr = Math.random().toString(36).substr(2);
      var timestamp = parseInt((new Date()).valueOf()/1000);
      var url = 'http://279b519f.ngrok.io/user.html';
      var str = 'jsapi_ticket='+jsapi_ticket+'&noncestr='+noncestr+'&timestamp='+timestamp+'&url='+url;
      const hashCode = crypto.createHash('sha1');
      var signature = hashCode.update(str, 'utf8').digest('hex');
      res.send({
        appId: that.appID,
        timestamp: timestamp,
        nonceStr: noncestr,
        signature: signature,
        jsApiList: ['updateAppMessageShareData','updateTimelineShareData'],
      });
    }else {
      console.log('获取jsapi_ticket失败');
    }
  });
}

WeChat.prototype.sendTplMsg = function (req, res) {
  var that = this;
  var username = req.query.username;
  var openid = req.query.openid;
  this.getAccessToken().then(function (data) {
    var requestData =  {
      "touser": openid,
      "template_id":"G8u7M-55MKsEr5knxFdzb1uZhioRhSID2tPq60y4eNA",         
      "data":{
        "username": {
          "value": username,
          "color":"#173177"
        },
        "leaveTime":{
          "value": 5,
          "color":"#ff0000"
        }
      }
    }
    //格式化请求连接
    var url = util.format(that.apiURL.sendTplMsg, that.apiDomain, data);
    //使用 Post 请求创建微信菜单
    that.requestPost(url, JSON.stringify(requestData)).then(function (data) {
      //将结果打印
      console.log(data);
    });
  });
}

//暴露可供外部访问的接口
module.exports = WeChat;
