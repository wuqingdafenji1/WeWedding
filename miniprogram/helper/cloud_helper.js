/**
 * Notes: 云操作类库
 * Ver : CCMiniCloud Framework 2.3.1 ALL RIGHTS RESERVED BY cclinux0730 (wechat)
 * Date: 2020-11-14 07:48:00 
 */

const helper = require('./helper.js');
const dataHelper = require('./data_helper.js');
const cacheHelper = require('./cache_helper.js');
const constants = require('../comm/constants.js');
const setting = require('../setting/setting.js');
const contentCheckHelper = require('../helper/content_check_helper.js');
const pageHelper = require('../helper/page_helper.js');

const CODE = {
	SUCC: 200,
	SVR: 500, //服务器错误  
	LOGIC: 1600, //逻辑错误 
	DATA: 1301, // 数据校验错误 
	HEADER: 1302, // header 校验错误  

	ADMIN_ERROR: 2401 //管理员错误
};

// 云函数提交请求(直接异步，无提示)
function callCloudSumbitAsync(route, params = {}, options) {
	if (!helper.isDefined(options)) options = {
		hint: false
	}
	if (!helper.isDefined(options.hint)) options.hint = false;
	return callCloud(route, params, options)
}

// 云函数提交请求(异步)
async function callCloudSumbit(route, params = {}, options = { title: '提交中...' }) {
	if (!helper.isDefined(options)) options = {
		title: '提交中..'
	}
	if (!helper.isDefined(options.title)) options.title = '提交中..';
	return await callCloud(route, params, options);
}

// 云函数获取数据请求(异步)
async function callCloudData(route, params = {}, options) {
	if (!helper.isDefined(options)) options = {
		title: '加载中..'
	}

	if (!helper.isDefined(options.title)) options.title = '加载中..';
	let result = await callCloud(route, params, options).catch(err => {
		return null; // 异常情况下返回空数据
	});

	// 直接提取数据 返回值有[], {} 两种形式，如果为空{} ,返回 null
	if (result && helper.isDefined(result.data)) {
		result = result.data;
		if (Array.isArray(result)) {
			// 数组处理
		} else if (Object.keys(result).length == 0) {
			result = null; //对象处理
		}

	}
	return result;
}

// 云函数请求(异步)
function callCloud(route, params = {}, options) {

	let title = '加载中';
	let hint = true; //数据请求时是否mask提示 

	// 标题
	if (helper.isDefined(options) && helper.isDefined(options.title))
		title = options.title;

	// 是否给提示
	if (helper.isDefined(options) && helper.isDefined(options.hint))
		hint = options.hint;

	// 是否输出错误并处理
	if (helper.isDefined(options) && helper.isDefined(options.doFail))
		doFail = options.doFail;

	if (hint) {
		if (title == 'bar')
			wx.showNavigationBarLoading();
		else
			wx.showLoading({
				title: title,
				mask: true
			})
	}

	let token = '';
	// 管理员token
	if (route.indexOf('admin/') > -1) {
		let admin = cacheHelper.get(constants.CACHE_ADMIN);
		if (admin && admin.token) token = admin.token;
	} else {
		//正常用户
		let user = cacheHelper.get(constants.CACHE_TOKEN);
		if (user && user.id) token = user.id;
	}

	return new Promise(function (resolve, reject) {

		let PID = pageHelper.getPID();

		wx.cloud.callFunction({
			name: 'mcloud',
			data: {
				route: route,
				token,
				PID,
				params
			},
			success: function (res) {
				if (res.result.code == CODE.LOGIC || res.result.code == CODE.DATA) {
					console.log(res)
					// 逻辑错误&数据校验错误 
					if (hint) {
						wx.showModal({
							title: '温馨提示',
							content: res.result.msg,
							showCancel: false
						});
					}

					reject(res.result);
					return;
				} else if (res.result.code == CODE.ADMIN_ERROR) {
					// 后台登录错误
					wx.reLaunch({
						url: pageHelper.fmtURLByPID('/pages/admin/index/login/admin_login'),
					});
					//reject(res.result);
					return;
				} else if (res.result.code != CODE.SUCC) {
					if (hint) {
						wx.showModal({
							title: '温馨提示',
							content: '系统开小差了，请稍后重试',
							showCancel: false
						});
					}
					reject(res.result);
					return;
				}

				resolve(res.result);
			},
			fail: function (err) {
				if (hint) {
					console.log(err)
					if (err && err.errMsg && err.errMsg.includes('-501000') && err.errMsg.includes('Environment not found')) {
						wx.showModal({
							title: '',
							content: '未找到云环境ID，请按手册检查前端配置文件setting.js的配置项【CLOUD_ID】或咨询作者微信cclinux0730',
							showCancel: false
						});

					} else if (err && err.errMsg && err.errMsg.includes('-501000') && err.errMsg.includes('FunctionName')) {
						wx.showModal({
							title: '',
							content: '云函数未创建或者未上传，请参考手册或咨询作者微信cclinux0730',
							showCancel: false
						});

					} else if (err && err.errMsg && err.errMsg.includes('-501000') && err.errMsg.includes('performed in the current function state')) {
						wx.showModal({
							title: '',
							content: '云函数正在上传中或者上传有误，请稍候',
							showCancel: false
						});
					} else
						wx.showModal({
							title: '',
							content: '网络故障，请稍后重试',
							showCancel: false
						});
				}
				reject(err.result);
				return;
			},
			complete: function (res) {
				if (hint) {
					if (title == 'bar')
						wx.hideNavigationBarLoading();
					else
						wx.hideLoading();
				}
				// complete
			}
		});
	});
}

/**
 * 数据列表请求
 * @param {*} that 
 * @param {*} listName 
 * @param {*} route 
 * @param {*} params 
 * @param {*} options 
 * @param {*} isReverse  是否倒序
 */
async function dataList(that, listName, route, params, options, isReverse = false) {

	console.log('dataList begin');

	if (!helper.isDefined(that.data[listName]) || !that.data[listName]) {
		let data = {};
		data[listName] = {
			page: 1,
			size: 20,
			list: [],
			count: 0,
			total: 0,
			oldTotal: 0
		};
		that.setData(data);
	}

	//改为后台默认控制
	//if (!helper.isDefined(params.size))
	//	params.size = 20;

	if (!helper.isDefined(params.isTotal))
		params.isTotal = true;

	let page = params.page;
	let count = that.data[listName].count;
	if (page > 1 && page > count) {
		wx.showToast({
			duration: 500,
			icon: 'none',
			title: '没有更多数据了',
		});
		return;
	}

	// 删除未赋值的属性
	for (let k in params) {
		if (!helper.isDefined(params[k]))
			delete params[k];
	}

	// 记录当前老的总数
	let oldTotal = 0;
	if (that.data[listName] && that.data[listName].total)
		oldTotal = that.data[listName].total;
	params.oldTotal = oldTotal;

	// 云函数调用 
	await callCloud(route, params, options).then(function (res) {
		console.log('cloud begin');

		// 数据合并
		let dataList = res.data;
		let tList = that.data[listName].list;

		if (dataList.page == 1) {
			tList = res.data.list;
		} else if (dataList.page > that.data[listName].page) { //大于当前页才能更新
			if (isReverse)
				tList = res.data.list.concat(tList);
			else
				tList = tList.concat(res.data.list);
		} else
			return;

		dataList.list = tList;
		let listData = {};
		listData[listName] = dataList;

		that.setData(listData);

		console.log('cloud END');
	}).catch(err => {
		console.log(err)
	});

	console.log('dataList END');

}

/**
 * 图片上传到云空间
 * @param {*} imgList 
 * @param {*} dir  存储路径
 * @param {*} id 记录ID
 * @param {*} prefix 前缀 
 */
async function transTempPics(imgList, dir, id, prefix = '') {

	if (prefix && !prefix.endsWith('_')) prefix += '_'; 

	for (let i = 0; i < imgList.length; i++) {

		let filePath = imgList[i];
		let ext = filePath.match(/\.[^.]+?$/)[0];

		// 是否为临时文件
		if (filePath.includes('tmp') || filePath.includes('temp') || filePath.includes('wxfile')) {
			let rd = prefix + dataHelper.genRandomNum(100000, 999999);
			await wx.cloud.uploadFile({
				cloudPath: id ? dir + id + '/' + rd + ext : dir + rd + ext,
				filePath: filePath, // 文件路径
			}).then(res => {
				imgList[i] = res.fileID;
			}).catch(error => {
				// handle error TODO:剔除图片
				console.error(error);
			})
		}
	}

	return imgList;
}

// 富文本图片上传到云空间
async function transRichEditorTempPics(content, dir, id, route) {

	let imgList = [];
	for (let k in content) {
		if (content[k].type == 'img') {
			imgList.push(content[k].val);
		}
	}

	// 图片上传到云空间
	imgList = await transTempPics(imgList, dir, id);

	// 更新图片地址
	let imgIdx = 0;
	for (let k in content) {
		if (content[k].type == 'img') {
			content[k].val = imgList[imgIdx];
			imgIdx++;
		}
	}

	// 更新本记录的图片信息
	let params = {
		id,
		content
	}

	try {
		// 更新数据 从promise 里直接同步返回
		await callCloudSumbit(route, params);
		return content;
	} catch (e) {
		console.error(e);
	}

	return [];
}

// 封面图片上传到云空间
async function transCoverTempPics(imgList, dir, id, route) {
	// 图片上传到云空间
	imgList = await transTempPics(imgList, dir, id);

	// 更新本记录的图片信息
	let params = {
		id,
		imgList: imgList
	}

	try {
		// 更新数据 从promise 里直接同步返回
		let res = await callCloudSumbit(route, params);
		return res.data.urls;
	} catch (err) {
		console.error(err);
	}
}

// 图片集合上传到云空间
async function transFormsTempPics(forms, dir, id, route) {
	wx.showLoading({
		title: '提交中...',
		mask: true
	});

	let hasImageForms = [];
	for (let k in forms) {
		if (forms[k].type == 'image') {
			forms[k].val = await transTempPics(forms[k].val, dir, id, 'image');
			hasImageForms.push(forms[k]);
		}
		else if (forms[k].type == 'content') {
			let contentVal = forms[k].val;
			for (let j in contentVal) {
				if (contentVal[j].type == 'img') {
					let ret = await transTempPics([contentVal[j].val], dir, id, 'content');
					contentVal[j].val = ret[0];
				}
			}
			hasImageForms.push(forms[k]);
		}
	}

	if (hasImageForms.length == 0) return;

	let params = {
		id,
		hasImageForms
	}

	try {
		await callCloudSumbit(route, params);
	} catch (err) {
		console.error(err);
	}
}


/**
 * 单个图片上传到云空间
 * @param {*} img 
 * @param {*} dir 
 * @param {*} id 
 * @return 返回cloudId
 */
async function transTempPicOne(img, dir, id, isCheck = true) {

	if (isCheck) {
		wx.showLoading({
			title: '图片校验中',
			mask: true
		});
		let check = await contentCheckHelper.imgCheck(img);
		if (!check) {
			wx.hideLoading();
			return pageHelper.showModal('不合适的图片, 请重新上传', '温馨提示');
		}
		wx.hideLoading();
	}



	let imgList = [img];
	imgList = await transTempPics(imgList, dir, id);

	if (imgList.length == 0)
		return '';
	else {
		return imgList[0];
	}


}

module.exports = {
	CODE,
	dataList,
	callCloud,
	callCloudSumbit,
	callCloudData,
	callCloudSumbitAsync,
	transTempPics,
	transRichEditorTempPics,
	transCoverTempPics,
	transFormsTempPics,
	transTempPicOne
}