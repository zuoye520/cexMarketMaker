import util from 'util';
import moment from 'moment';

function info(){
    const param = [];
    for(var i=0;i<arguments.length;i++){
        param[i] = arguments[i];
    }
    const time = moment().format("yyyy/MM/DD HH:mm:ss")
    console.info(`${time} [INFO] `,util.format.apply(this,param));

}
function debug(){
    const param = [];
    for(var i=0;i<arguments.length;i++){
        param[i] = arguments[i];
    }
    const time = moment().format("yyyy/MM/DD HH:mm:ss")
    console.debug(`${time} [DEBUG] `,util.format.apply(this,param));
}

function error(){
    const param = [];
    for(var i=0;i<arguments.length;i++){
        param[i] = arguments[i];
    }
    const time = moment().format("yyyy/MM/DD HH:mm:ss")
    console.error(`${time} [ERROR] `,util.format.apply(this,param));
}


// 默认导出一个对象
export default {
    info,
    debug,
    error
};