if (typeof cX === "undefined" || typeof halfW === "undefined") {
    _getDisplay(true);
}
if (typeof debugInfo === "undefined") {
    debugInfo = _debugInfo;
}
if (typeof timeRecorder === "undefined") {
    timeRecorder = _timeRecorder;
}

let ext = {
    getName(img) {
        let img_str = img.toString().split("@")[1];
        return img_str ? "@" + img_str.match(/\w+/)[0] : "(已提前回收)";
    },
    isRecycled(img) {
        if (!img) return true;
        try {
            img.getHeight();
        } catch (e) {
            return !!e.message.match(/has been recycled/);
        }
    },
    isImageWrapper: (img) => {
        return img
            && typeof img === "object"
            && img["getClass"]
            && img.toString().match(/ImageWrapper/);
    },
    reclaim: _reclaim,
    capt() {
        let _max = 10;
        while (_max--) {
            try {
                _permitCapt();
                let _img = images.captureScreen();
                // prevent "_img" from being auto-recycled
                let _copy = images.copy(_img);
                _reclaim(_img);
                return _copy;
            } catch (e) {
                sleep(240);
            }
        }
        let _msg = "截取当前屏幕失败";
        console.error(_msg);
        toast(_msg);
        exit();
    },
    tryRequestScreenCapture: _permitCapt, // legacy
    permitCapt: _permitCapt,
    permit: _permitCapt,
    matchTpl(capt, tpl, opt) {
        let _capt;
        let _no_capt_fg;
        if (!capt) {
            _capt = images.capt();
            _no_capt_fg = true;
        } else {
            _capt = capt;
        }

        let _opt = opt || {};

        let _name = _opt.name;
        let _path = "";
        let _res_range = [];
        if (_name) {
            let _dir = files.getSdcardPath() + "/.local/Pics/";
            files.createWithDirs(_dir);
            _path = _dir + _name + ".png";
        }

        let _tpl = _bySto(_name) || _byAttempt(tpl);
        if (_tpl) {
            let _par = {};
            let _max = _opt.max;
            let _thrd = _opt.threshold_result;
            if (_max) {
                _par.max = _max;
            }
            if (_thrd) {
                _par.threshold = _thrd;
            }

            let _res = images.matchTemplate(_capt, _tpl, _par);
            if (!_res_range[0]) {
                let _w = _tpl.getWidth() * 720 / W;
                _res_range[0] = +_w.toFixed(2);
            }
            _res.range = _res_range;

            if (_no_capt_fg) {
                _capt.recycle();
                _capt = null;
            }

            return _res;
        }
        return null;

        // tool function(s) //

        function _bySto(name) {
            if (!name || !files.exists(_path)) {
                return;
            }
            let _af = typeof $$af !== "undefined";
            let _key = "img_" + name;
            if (_af && $$af[_key]) {
                return $$af[_key];
            }
            let _img = images.read(_path);
            if (!_af) {
                $$af = {};
            }
            return $$af[_key] = _img;
        }

        function _byAttempt(tpl) {
            if (!tpl) {
                return null;
            }
            let _range = _opt.range || [0, 0];
            let [_min, _max] = _range.map(x => cX(x));
            for (let i = _min; i <= _max; i += 1) {
                let _w = tpl.getWidth();
                let _h = tpl.getHeight();
                let _new_w = i || _w;
                let _new_h = Math.trunc(_h / _w * i);
                for (let j = 0; j <= 1; j += 1) {
                    let _resized = images.resize(
                        tpl, [_new_w, _new_h + j], "LANCZOS4"
                    );
                    let _recycleNow = () => {
                        _resized.recycle();
                        _resized = null;
                    };
                    let _par = {};
                    let _thrd = _opt.threshold_attempt;
                    let _region = _opt.region_attempt;
                    if (_thrd) {
                        _par.threshold = _thrd;
                    }
                    if (_region) {
                        _par.region = _region;
                    }
                    if (images.findImage(_capt, _resized, _par)) {
                        if (_name) {
                            debugInfo("已存储模板: " + _name);
                            images.save(_resized, _path);
                        }
                        _res_range = [+(i * 720 / W).toFixed(2), j];
                        return _resized;
                    }
                    _recycleNow();
                }
            }
        }
    },
    findColorInBounds(img, src, color, threshold) {
        if (!color) {
            throw ("findColorInBounds的color参数无效");
        }

        let _img = img || images.capt();
        let _srcMch = rex => src.toString().match(rex);

        let _bnd;
        if (_srcMch(/^Rect/)) {
            _bnd = src;
        } else if (_srcMch(/^((text|desc|id)(Matches)?)\(/)) {
            let _node = src.findOnce();
            if (!_node) {
                return null;
            }
            _bnd = _node.bounds();
        } else if (_srcMch(/UiObject/)) {
            _bnd = src.bounds();
        } else {
            throw ("findColorInBounds的src参数类型无效");
        }

        let _x = _bnd.left;
        let _y = _bnd.top;
        let _w = _bnd.right - _x;
        let _h = _bnd.bottom - _y;

        let _mch = col => images.findColorInRegion(
            _img, col, _x, _y, _w, _h, threshold
        );
        if (typeof color !== "object") {
            return _mch(color) ? _bnd : null;
        }

        for (let i = 0, len = color.length; i < len; i += 1) {
            if (!_mch(color[i])) {
                return null;
            }
        }
        return _bnd;
    },
    bilateralFilter(img, d, sigmaColor, sigmaSpace, borderType) {
        let {Mat} = com.stardust.autojs.core.opencv;
        let {Imgproc} = org.opencv.imgproc;
        let {Core} = org.opencv.core;

        _initIfNeeded();

        let mat = new Mat();
        let size = d || 0;
        let sc = sigmaColor || 40;
        let ss = sigmaSpace || 20;
        let type = Core["BORDER_" + (borderType || "DEFAULT")];

        Imgproc.bilateralFilter(img["mat"], mat, size, sc, ss, type);

        return images.matToImage(mat);

        // tool function(s) //

        function _initIfNeeded() {
            runtime.getImages().initOpenCvIfNeeded();
        }
    },
    findAFBallsByHough(param) {
        timeRecorder("hough_beginning");
        let _du = {};
        let _par = param || {};
        let _cfg = Object.assign(
            _$DEFAULT(),
            global.$$cfg || {},
            _par.config || {}
        );
        let _no_dbg = _par.no_debug_info;
        let _dbg_bak;
        let $_flag = global.$$flag = global.$$flag || {};

        _dbgBackup();

        let _src_img_stg = _cfg.hough_src_img_strategy;
        let _results_stg = _cfg.hough_results_strategy;
        let _min_dist = cX(_cfg.min_balls_distance);
        let _region = _cfg.forest_balls_rect_region
            .map((v, i) => (i % 2
                    ? v < 1 ? cY(v) : v
                    : v < 1 ? cX(v) : v
            ));

        let _balls_data = [];
        let _balls_data_o = {};
        let _pool = _par.pool || {
            data: [],
            interval: _cfg.fri_forest_pool_itv,
            limit: _cfg.fri_forest_pool_limit,
            get len() {
                return this.data.length;
            },
            get filled_up() {
                return this.len >= this.limit;
            },
            add(capt) {
                capt = capt || ext.capt();
                this.filled_up && this.reclaimLast();
                let _img_name = ext.getName(capt);
                debugInfo("添加森林页面采样: " + _img_name);
                this.data.unshift(capt);
            },
            reclaimLast() {
                let _last = this.data.pop();
                let _img_name = ext.getName(_last);
                debugInfo("森林页面采样已达阈值: " + this.limit);
                debugInfo(">移除并回收最旧样本: " + _img_name);
                ext.reclaim(_last);
                _last = null;
            },
            reclaimAll() {
                if (!this.len) {
                    return;
                }
                debugInfo("回收全部森林页面采样");
                this.data.forEach((capt) => {
                    let _img_name = ext.getName(capt);
                    ext.reclaim(capt);
                    debugInfo(">已回收: " + _img_name);
                    capt = null;
                });
                this.clear();
                debugInfo("森林页面样本已清空");
            },
            clear() {
                this.data.splice(0, this.len);
            },
        };
        let _capt = null;
        let _capture = (t) => {
            _capt = ext.capt();
            sleep(t || 0);
            return _capt;
        };

        _setWballExtFunction();
        _fillUpForestImgPool();
        _analyseEnergyBalls();

        _dbgRestore();

        let _du_o = _par.duration !== false ? {
            duration: Object.assign({
                _map: [
                    ["gray", "灰度化"],
                    ["adapt_thrd", "自适应阈值"],
                    ["med_blur", "中值滤波"],
                    ["blur", "均值滤波"],
                    ["blt_fltr", "双边滤波"],
                    ["img_samples_processing", "数据处理"],
                    // disabled as misunderstanding may caused
                    // ["total", "总计用时"],
                ],
                total: timeRecorder("hough_beginning", "L"),
                showDebugInfo() {
                    debugInfo("__split_line__dash__");
                    debugInfo("图像填池: " +
                        this.fill_up_pool + "ms" + "  [ " +
                        _cfg.fri_forest_pool_itv + ", " +
                        _cfg.fri_forest_pool_limit + " ]"
                    );
                    this._map.forEach((arr) => {
                        let [_k, _v] = arr;
                        if (_k in this) {
                            if (this.hasOwnProperty(_k)) {
                                debugInfo(_v + ": " + this[_k] + "ms");
                            }
                        }
                    });
                    debugInfo("__split_line__dash__");
                },
            }, _du),
        } : {};

        return Object.assign(_balls_data_o, _du_o, {
            expand() {
                let _data = [];
                for (let i in this) {
                    if (this.hasOwnProperty(i)) {
                        if (Array.isArray(this[i])) {
                            this[i].forEach(o => _data.push(o));
                        }
                    }
                }
                return _data;
            },
        });

        // tool function(s) //

        function _dbgBackup() {
            if (_no_dbg) {
                _dbg_bak = $_flag.debug_info_avail;
                $_flag.debug_info_avail = false;
            }
        }

        function _dbgRestore() {
            if (_no_dbg) {
                $_flag.debug_info_avail = _dbg_bak;
            }
        }

        function _setWballExtFunction() {
            if (!images.inTreeArea) {
                images.inTreeArea = (o) => {
                    // TODO...
                    let _tree_area = {x: halfW, y: cYx(670), r: cX(182)};
                    if (typeof o !== "object" || !o.r) {
                        throw Error("inTreeArea() invoked with invalid arguments");
                    }
                    let {x: _ox, y: _oy, r: _or} = o;
                    let {x: _zx, y: _zy, r: _zr} = _tree_area;
                    let _ct_dist_min = _or + _zr;
                    let _ct_dist = Math.sqrt(
                        Math.pow(_zy - _oy, 2) + Math.pow(_zx - _ox, 2)
                    );
                    return _ct_dist < _ct_dist_min;
                }
            }
            if (!images.isWball) {
                images.isWball = (o, capt, container) => {
                    let _capt = capt || images.capt();
                    let _ctx = o.x;
                    let _cty = o.y;
                    let _offset = o.r / Math.SQRT2;
                    let _x_min = _ctx - _offset;
                    let _y_min = _cty - _offset;
                    let _x_max = _ctx + _offset;
                    let _y_max = _cty + _offset;
                    let _step = 2;
                    let _hue_max = _cfg.homepage_water_ball_max_hue_b0;
                    let _cty_max = cYx(626, -2); // TODO...
                    let _result = false;

                    if (_cty > _cty_max) {
                        return _result;
                    }

                    while (_x_min < _x_max && _y_min < _y_max) {
                        let _col = images.pixel(_capt, _x_min, _y_min);
                        let _red = colors.red(_col);
                        let _green = colors.green(_col);
                        // hue value in HSB mode without blue component
                        let _hue = 120 - (_red / _green) * 60;
                        if (isFinite(_hue) && _hue < _hue_max) {
                            if (Array.isArray(container)) {
                                container.push(o);
                            }
                            _result = true;
                            break;
                        }
                        _x_min += _step;
                        _y_min += _step;
                    }

                    if (!capt) {
                        images.reclaim(_capt);
                        _capt = null;
                    }

                    return _result;
                };
            }
            if (!images.isRipeBall) {
                images.isRipeBall = (o, capt, container) => {
                    if (images.inTreeArea(o)) {
                        return;
                    }
                    let _capt = capt || images.capt();
                    let _d = o.r / 4;
                    let _colors = _cfg.ripe_ball_ident_colors;
                    let _result = false;

                    for (let i = 0, l = _colors.length; i < l; i += 1) {
                        if (images.findColor(_capt, _colors[i], {
                            region: [o.x - _d, o.y - _d, _d * 2, _d * 2],
                            threshold: _cfg.ripe_ball_threshold,
                        })) {
                            if (Array.isArray(container)) {
                                container.push(o);
                            }
                            _result = true;
                            break;
                        }
                    }

                    if (!capt) {
                        images.reclaim(_capt);
                        _capt = null;
                    }

                    return _result;
                };
            }
            if (!images.isOrangeBall) {
                images.isOrangeBall = (o, capt, container) => {
                    if (images.inTreeArea(o)) {
                        return false;
                    }
                    let _capt = capt || images.capt();
                    let _ctx = o.x + cX(52);
                    let _cty = o.y + cYx(57);
                    let _offset = o.r / 4;
                    let _colors = _cfg.help_ball_ident_colors;
                    let _result = false;

                    for (let i = 0, l = _colors.length; i < l; i += 1) {
                        let _l = _ctx - _offset;
                        let _t = _cty - _offset;
                        let _w = Math.min(_offset * 2, W - _l);
                        let _h = Math.min(_offset * 2, H - _t);
                        if (images.findColor(_capt, _colors[i], {
                            region: [_l, _t, _w, _h],
                            threshold: _cfg.help_ball_threshold,
                        })) {
                            if (Array.isArray(container)) {
                                container.push(o);
                            }
                            _result = true;
                            break;
                        }
                    }

                    if (!capt) {
                        images.reclaim(_capt);
                        _capt = null;
                    }

                    return _result;
                };
            }
        }

        function _fillUpForestImgPool() {
            timeRecorder("fill_up_pool");
            let _max = _pool.limit + 1;
            while (_max--) {
                _pool.add(_capture());
                sleep(_pool.interval);
                if (!_pool.len || _pool.filled_up) {
                    break;
                }
            }
            _du.fill_up_pool = timeRecorder("fill_up_pool", "L");
        }

        function _analyseEnergyBalls() {
            debugInfo("分析森林页面样本中的能量球");
            _pool.data.forEach(_parse);
            debugInfo("森林页面样本能量球分析完毕");
            debugInfo("解析的能量球数量: " + _balls_data.length);
            _balls_data.forEach((o) => {
                _balls_data_o[o.type] = _balls_data_o[o.type] || [];
                _balls_data_o[o.type].push(o);
            });
            _par.pool && _par.keep_pool_data || _pool.reclaimAll();

            // tool function(s) //

            function _parse(capt) {
                if (!capt || ext.isRecycled(capt)) {
                    capt = ext.capt();
                }
                let [_l, _t, _r, _b] = _region;
                let [_w, _h] = [_r - _l, _b - _t];

                let _gray = _getImg("gray", true, () => images.grayscale(capt));

                let _adapt_thrd = _getImg("adapt_thrd", _src_img_stg.adapt_thrd,
                    () => images.adaptiveThreshold(
                        _gray, 255, "GAUSSIAN_C", "BINARY_INV", 9, 6
                    )
                );
                let _med_blur = _getImg("med_blur", _src_img_stg.med_blur,
                    () => images.medianBlur(_gray, 9)
                );
                let _blur = _getImg("blur", _src_img_stg.blur,
                    () => images.blur(_gray, 9, [-1, -1], "REPLICATE")
                );
                let _blt_fltr = _getImg("blt_fltr", _src_img_stg.blt_fltr,
                    () => ext.bilateralFilter(_gray, 9, 20, 20, "REPLICATE")
                );

                let _proc_key = "img_samples_processing";
                timeRecorder(_proc_key);
                let _wballs = [];
                let _balls = []
                    .concat(_getBalls(_src_img_stg.gray && _gray))
                    .concat(_getBalls(_adapt_thrd))
                    .concat(_getBalls(_med_blur))
                    .concat(_getBalls(_blur))
                    .concat(_getBalls(_blt_fltr))
                    .filter(_filterWball)
                    .sort(_sortX);

                _reclaimImages();

                if (_wballs.length + _balls.length) {
                    _antiOverlap();
                    _symmetrical();
                    _linearInterpolate();
                    _addBalls();
                }

                _du[_proc_key] = timeRecorder(_proc_key, "L");

                // tool function(s) //

                function _getImg(name, condition, imgFunc) {
                    if (condition) {
                        timeRecorder(name);
                        let _img = imgFunc();
                        let _et = timeRecorder(name, "L");
                        _du[name] ? _du[name] = _et : _du[name] += _et;
                        return _img;
                    }
                }

                function _reclaimImages() {
                    ext.reclaim(
                        _gray, _adapt_thrd, _med_blur, _blur, _blt_fltr
                    );
                    _gray = _adapt_thrd = _med_blur = _blur = _blt_fltr = null;
                }

                function _antiOverlap() {
                    if (_results_stg.anti_ovl) {
                        _antiX(_balls);
                        _antiX(_wballs);
                        _antiXY(_balls, _wballs);
                    }

                    // tool function(s) //

                    function _antiX(o) {
                        for (let i = 1; i < o.length; i += 1) {
                            if (o[i].x - o[i - 1].x < _min_dist) {
                                o.splice(i--, 1);
                            }
                        }
                    }

                    function _antiXY(sample, ref) {
                        let _chkSample = (smp, ref, i) => {
                            let _cond_x = Math.abs(ref.x - smp.x) < _min_dist;
                            let _cond_y = Math.abs(ref.y - smp.y) < _min_dist;
                            if (_cond_x && _cond_y) {
                                sample.splice(i--, 1);
                            }
                        };

                        if (ref) {
                            return ref.forEach((_ref) => {
                                for (let i = 0; i < sample.length; i += 1) {
                                    _chkSample(sample[i], _ref, i);
                                }
                            });
                        }
                        for (let i = 1; i < sample.length; i += 1) {
                            _chkSample(sample[i - 1], sample[i], i);
                        }
                    }
                }

                function _symmetrical() {
                    if (!_results_stg.symmetrical || !_balls.length) {
                        return;
                    }
                    if (_balls.length === 1) {
                        let {x: _x} = _balls[0];
                        if (Math.abs(_x - halfW) <= _min_dist) {
                            return;
                        }
                    }
                    let _right_ball = _balls[_balls.length - 1];
                    let _left_ball = _balls[0];
                    let _max = _right_ball.x;
                    let _min = _left_ball.x;
                    let _ext = Math.max(_max - halfW, halfW - _min);
                    if (_min - (halfW - _ext) > _min_dist) {
                        _balls.unshift({
                            x: halfW - _ext,
                            y: _right_ball.y,
                            r: _right_ball.r,
                            computed: true,
                        });
                    } else if (halfW + _ext - _max > _min_dist) {
                        _balls.push({
                            x: halfW + _ext,
                            y: _left_ball.y,
                            r: _left_ball.r,
                            computed: true,
                        });
                    }
                }

                function _linearInterpolate() {
                    if (!_results_stg.linear_itp) {
                        return;
                    }
                    let _step = _getMinStep();
                    for (let i = 1; i < _balls.length; i += 1) {
                        let _diff = _balls[i].x - _balls[i - 1].x;
                        let _dist = Math.round(_diff / _step);
                        if (_dist < 2) {
                            continue;
                        }
                        let _dx = _diff / _dist;
                        let _dy = (_balls[i].y - _balls[i - 1].y) / _dist;
                        let _data = [];
                        for (let k = 1; k < _dist; k += 1) {
                            _data.push({
                                x: _balls[i - 1].x + _dx * k,
                                y: _balls[i - 1].y + _dy * k,
                                r: (_balls[i].r + _balls[i - 1].r) / 2,
                                computed: true,
                            });
                        }
                        _balls.splice.apply(_balls, [i, 0].concat(_data));
                        i += _data.length;
                    }

                    // tool function(s) //

                    function _getMinStep() {
                        let _step = Infinity;
                        _balls.forEach((v, i, a) => {
                            if (i) {
                                let _diff = a[i].x - a[i - 1].x;
                                if (_diff < _step) {
                                    _step = _diff;
                                }
                            }
                        });
                        return _step;
                    }
                }

                function _addBalls() {
                    _wballs.map(_extProperties).forEach((o) => {
                        if (_isRipeBall(o, capt)) {
                            return _addBall(o, "ripe");
                        }
                        _addBall(o, "water");
                    });
                    _balls.map(_extProperties).forEach((o) => {
                        if (_isRipeBall(o, capt)) {
                            if (_isOrangeBall(o)) {
                                return _addBall(o, "orange");
                            }
                            return _addBall(o, "ripe");
                        }
                        if (!images.inTreeArea(o)) {
                            _addBall(o, "naught");
                        }
                    });

                    // tool function(s) //

                    function _isOrangeBall(o) {
                        return images.isOrangeBall(o, capt);
                    }

                    function _isRipeBall(o) {
                        return images.isRipeBall(o, capt);
                    }

                    function _addBall(o, type) {
                        let _pri = {orange: 9, ripe: 6, naught: 3};
                        let _data_idx = _getDataIdx(o);
                        if (!~_data_idx) {
                            _balls_data.push(Object.assign({type: type}, o));
                        } else if (_pri[type] > _pri[_balls_data[_data_idx].type]) {
                            // low-priority data will be replaced with the one with higher priority
                            // eg: assumed that there was a ball with "ripe" property of type,
                            // another ball which was taken as the identical ball with the one above
                            // will replace "ripe" with "orange"
                            // however, "orange" won't be replace with "ripe" even "naught"
                            _balls_data[_data_idx] = Object.assign({type: type}, o);
                        }

                        // tool function(s) //

                        function _getDataIdx(o) {
                            let _l = _balls_data.length;
                            for (let i = 0; i < _l; i += 1) {
                                // take as identical balls
                                if (Math.abs(o.x - _balls_data[i].x) < _min_dist / 2) {
                                    return i;
                                }
                            }
                            return -1;
                        }
                    }

                    function _extProperties(o) {
                        let {x: _x, y: _y, r: _r} = o;
                        return Object.assign(o, {
                            left: _x - _r,
                            top: _y - _r,
                            right: _x + _r,
                            bottom: _y + _r,
                            // width and height were made functional
                            // just for better compatible with Auto.js
                            width: () => _r * 2,
                            height: () => _r * 2,
                        });
                    }
                }

                function _getBalls(img, par1, par2) {
                    return !img ? [] : images
                        .findCircles(img, {
                            dp: 1,
                            minDist: _min_dist,
                            minRadius: cX(0.06),
                            maxRadius: cX(0.078),
                            param1: par1 || 15,
                            param2: par2 || 15,
                            region: [_l, _t, _w, _h],
                        })
                        .map(o => {
                            // o.x and o.y are relative,
                            // yet x and y are absolute
                            let _x = o.x + _l;
                            let _y = o.y + _t;
                            let _r = +o.radius.toFixed(2);
                            return {x: _x, y: _y, r: _r};
                        })
                        .filter(o => (
                            o.x - o.r >= _l &&
                            o.x + o.r <= _r &&
                            o.y - o.r >= _t &&
                            o.y + o.r <= _b
                        ))
                        .sort(_sortX);
                }

                function _sortX(a, b) {
                    return a.x === b.x ? 0 : a.x > b.x ? 1 : -1;
                }

                function _filterWball(o) {
                    return o && !images.isWball(o, capt, _wballs);
                }
            }
        }

        // updated at Jun 3, 2020
        function _$DEFAULT() {
            return {
                help_ball_ident_colors: [
                    "#f99137", "#f9933a", "#e9b781"
                ],
                help_ball_threshold: 35,
                ripe_ball_ident_colors: ["#ceff5f"],
                ripe_ball_threshold: 13,
                forest_balls_rect_region: [
                    cX(0.1), cYx(0.18), cX(0.9), cYx(0.45)
                ],
                hough_src_img_strategy: {
                    gray: true,
                    adapt_thrd: true,
                    med_blur: true,
                    blur: true,
                    blt_fltr: false,
                },
                hough_results_strategy: {
                    anti_ovl: true,
                    symmetrical: true,
                    linear_itp: true,
                },
                min_balls_distance: 0.09,
                fri_forest_pool_limit: 3,
                fri_forest_pool_itv: 120,
                homepage_water_ball_max_hue_b0: 44,
            };
        }
    },
};
ext.capture = ext.captureCurrentScreen = () => ext.capt();

module.exports = ext;
module.exports.load = () => Object.assign(global.images, ext);

// tool function(s) //

function _newSize(size) {
    let {Size} = org.opencv.core;
    if (!Array.isArray(size)) {
        size = [size, size];
    }
    if (size.length === 1) {
        size = [size[0], size[0]];
    }
    return new Size(size[0], size[1]);
}

/**
 * Just an insurance way of images.requestScreenCapture()
 *  to avoid infinite stuck or stalled without any hint or log
 * During this operation, permission prompt window
 *  will be confirmed (with checkbox checked if possible)
 *  automatically with effort
 * @param {object} [params]
 * @param {boolean} [params.debug_info_flag]
 * @param {boolean} [params.restart_this_engine_flag=true]
 * @param {object} [params.restart_this_engine_params]
 * @param {string} [params.restart_this_engine_params.new_file]
 *  - new engine task name with or without path or file extension name
 * <br>
 *     -- *DEFAULT* - old engine task <br>
 *     -- new file - like "hello.js", "../hello.js" or "hello"
 * @param {boolean} [params.restart_this_engine_params.debug_info_flag]
 * @param {number} [params.restart_this_engine_params.max_restart_engine_times=3]
 *  - max restart times for avoiding infinite recursion
 * @return {boolean}
 */
function _permitCapt(params) {
    let _$$und = x => typeof x === "undefined";
    let _$$isJvo = x => x && !!x["getClass"];
    let _key = "_$_request_screen_capture";
    let _fg = global[_key];

    if (_$$isJvo(_fg)) {
        if (_fg) return true;
        _fg.incrementAndGet();
    } else {
        global[_key] = threads.atomic(1);
    }

    let _par = params || {};
    let _debugInfo = (m, fg) => (
        typeof debugInfo === "undefined" ? debugInfoRaw : debugInfo
    )(m, fg, _par.debug_info_flag);

    _debugInfo("开始申请截图权限");

    let _waitForAction = (
        typeof waitForAction === "undefined" ? waitForActionRaw : waitForAction
    );
    let _messageAction = (
        typeof messageAction === "undefined" ? messageActionRaw : messageAction
    );
    let _clickAction = (
        typeof clickAction === "undefined" ? clickActionRaw : clickAction
    );
    let _getSelector = (
        typeof getSelector === "undefined" ? getSelectorRaw : getSelector
    );
    let _$$sel = _getSelector();

    if (_$$und(_par.restart_this_engine_flag)) {
        _par.restart_this_engine_flag = true;
    } else {
        let _self = _par.restart_this_engine_flag;
        _par.restart_this_engine_flag = !!_self;
    }
    if (!_par.restart_this_engine_params) {
        _par.restart_this_engine_params = {};
    }
    if (!_par.restart_this_engine_params.max_restart_engine_times) {
        _par.restart_this_engine_params.max_restart_engine_times = 3;
    }

    _debugInfo("已开启弹窗监测线程");
    let _thread_prompt = threads.start(function () {
        let _kw_remember = id("com.android.systemui:id/remember");
        let _sel_remember = () => _$$sel.pickup(_kw_remember);
        let _rex_sure = /S(tart|TART) [Nn][Oo][Ww]|立即开始|允许/;
        let _sel_sure = type => _$$sel.pickup(_rex_sure, type);

        if (_waitForAction(_sel_sure, 5e3)) {
            if (_waitForAction(_sel_remember, 1e3)) {
                _debugInfo('勾选"不再提示"复选框');
                _clickAction(_sel_remember(), "w");
            }
            if (_waitForAction(_sel_sure, 2e3)) {
                let _node = _sel_sure();
                let _act_msg = '点击"' + _sel_sure("txt") + '"按钮';

                _debugInfo(_act_msg);
                _clickAction(_node, "w");

                if (!_waitForAction(() => !_sel_sure(), 1e3)) {
                    _debugInfo("尝试click()方法再次" + _act_msg);
                    _clickAction(_node, "click");
                }
            }
        }
    });

    let _thread_monitor = threads.start(function () {
        if (_waitForAction(() => !!_req_result, 3.6e3, 300)) {
            _thread_prompt.interrupt();
            return _debugInfo("截图权限申请结果: " + _req_result);
        }
        if (typeof $$flag !== "undefined") {
            if (!$$flag.debug_info_avail) {
                $$flag.debug_info_avail = true;
                _debugInfo("开发者测试模式已自动开启", 3);
            }
        }
        if (_par.restart_this_engine_flag) {
            _debugInfo("截图权限申请结果: 失败", 3);
            try {
                let _m = android.os.Build.MANUFACTURER.toLowerCase();
                if (_m.match(/xiaomi/)) {
                    _debugInfo("__split_line__dash__");
                    _debugInfo("检测到当前设备制造商为小米", 3);
                    _debugInfo("可能需要给Auto.js以下权限:", 3);
                    _debugInfo('>"后台弹出界面"', 3);
                    _debugInfo("__split_line__dash__");
                }
            } catch (e) {
                // nothing to do here
            }
            if (restartThisEngine(_par.restart_this_engine_params)) {
                return;
            }
        }
        _messageAction("截图权限申请失败", 9, 1, 0, 1);
    });

    let _req_result = images.requestScreenCapture(false);
    _thread_monitor.join();

    if (_req_result) {
        return true;
    }
    _fg.decrementAndGet();

    // raw function(s) //

    function getSelectorRaw() {
        let classof = o => Object.prototype.toString.call(o).slice(8, -1);
        let sel = selector();
        sel.__proto__ = {
            pickup(filter) {
                if (classof(filter) === "JavaObject") {
                    if (filter.toString().match(/UiObject/)) return filter;
                    return filter.findOnce() || null;
                }
                if (typeof filter === "string") return desc(filter).findOnce() || text(filter).findOnce() || null;
                if (classof(filter) === "RegExp") return descMatches(filter).findOnce() || textMatches(filter).findOnce() || null;
                return null;
            },
        };
        return sel;
    }

    function debugInfoRaw(msg, info_flg) {
        if (info_flg) {
            let _s = msg || "";
            _s = _s.replace(/^(>*)( *)/, ">>" + "$1 ");
            console.verbose(_s);
        }
    }

    function waitForActionRaw(cond_func, time_params) {
        let _cond_func = cond_func;
        if (!cond_func) return true;
        let classof = o => Object.prototype.toString.call(o).slice(8, -1);
        if (classof(cond_func) === "JavaObject") _cond_func = () => cond_func.exists();
        let _check_time = typeof time_params === "object" && time_params[0] || time_params || 10e3;
        let _check_interval = typeof time_params === "object" && time_params[1] || 200;
        while (!_cond_func() && _check_time >= 0) {
            sleep(_check_interval);
            _check_time -= _check_interval;
        }
        return _check_time >= 0;
    }

    function clickActionRaw(kw) {
        let classof = o => Object.prototype.toString.call(o).slice(8, -1);
        let _kw = classof(kw) === "Array" ? kw[0] : kw;
        let _key_node = classof(_kw) === "JavaObject" && _kw.toString().match(/UiObject/) ? _kw : _kw.findOnce();
        if (!_key_node) return;
        let _bounds = _key_node.bounds();
        click(_bounds.centerX(), _bounds.centerY());
        return true;
    }

    function messageActionRaw(msg, lv, if_toast) {
        let _s = msg || " ";
        if (lv && lv.toString().match(/^t(itle)?$/)) {
            let _par = ["[ " + msg + " ]", 1, if_toast];
            return messageActionRaw.apply({}, _par);
        }
        let _lv = +lv;
        if (if_toast) {
            toast(_s);
        }
        if (_lv >= 3) {
            if (_lv >= 4) {
                console.error(_s);
                if (_lv >= 8) {
                    exit();
                }
            } else {
                console.warn(_s);
            }
            return;
        }
        if (_lv === 0) {
            console.verbose(_s);
        } else if (_lv === 1) {
            console.log(_s);
        } else if (_lv === 2) {
            console.info(_s);
        }
        return true;
    }

    // tool function(s) //

    // updated: Dec 27, 2019
    function restartThisEngine(params) {
        let _params = params || {};

        let _messageAction = typeof messageAction === "undefined" ? messageActionRaw : messageAction;
        let _debugInfo = (_msg, _info_flag) => (typeof debugInfo === "undefined" ? debugInfoRaw : debugInfo)(_msg, _info_flag, _params.debug_info_flag);

        let _my_engine = engines.myEngine();
        let _my_engine_id = _my_engine.id;

        let _max_restart_engine_times_argv = _my_engine.execArgv.max_restart_engine_times;
        let _max_restart_engine_times_params = _params.max_restart_engine_times;
        let _max_restart_engine_times;
        if (typeof _max_restart_engine_times_argv === "undefined") {
            if (typeof _max_restart_engine_times_params === "undefined") _max_restart_engine_times = 1;
            else _max_restart_engine_times = _max_restart_engine_times_params;
        } else _max_restart_engine_times = _max_restart_engine_times_argv;

        _max_restart_engine_times = +_max_restart_engine_times;
        let _max_restart_engine_times_backup = +_my_engine.execArgv.max_restart_engine_times_backup || _max_restart_engine_times;

        if (!_max_restart_engine_times) {
            _messageAction("引擎重启已拒绝", 3);
            return !~_messageAction("引擎重启次数已超限", 3, 0, 1);
        }

        _debugInfo("重启当前引擎任务");
        _debugInfo(">当前次数: " + (_max_restart_engine_times_backup - _max_restart_engine_times + 1));
        _debugInfo(">最大次数: " + _max_restart_engine_times_backup);
        let _file_name = _params.new_file || _my_engine.source.toString();
        if (_file_name.match(/^\[remote]/)) _messageAction("远程任务不支持重启引擎", 8, 1, 0, 1);

        let _file_path = files.path(_file_name.match(/\.js$/) ? _file_name : (_file_name + ".js"));
        _debugInfo("运行新引擎任务:\n" + _file_path);
        _runJsFile(_file_path, Object.assign({}, _params, {
            max_restart_engine_times: _max_restart_engine_times - 1,
            max_restart_engine_times_backup: _max_restart_engine_times_backup,
            instant_run_flag: _params.instant_run_flag,
        }));
        _debugInfo("强制停止旧引擎任务");
        // _my_engine.forceStop();
        engines.all().filter(e => e.id === _my_engine_id).forEach(e => e.forceStop());
        return true;

        // raw function(s) //

        function messageActionRaw(msg, lv, if_toast) {
            let _s = msg || " ";
            if (lv && lv.toString().match(/^t(itle)?$/)) {
                let _par = ["[ " + msg + " ]", 1, if_toast];
                return messageActionRaw.apply({}, _par);
            }
            let _lv = +lv;
            if (if_toast) {
                toast(_s);
            }
            if (_lv >= 3) {
                if (_lv >= 4) {
                    console.error(_s);
                    if (_lv >= 8) {
                        exit();
                    }
                } else {
                    console.warn(_s);
                }
                return;
            }
            if (_lv === 0) {
                console.verbose(_s);
            } else if (_lv === 1) {
                console.log(_s);
            } else if (_lv === 2) {
                console.info(_s);
            }
            return true;
        }

        function debugInfoRaw(msg, info_flg) {
            if (info_flg) {
                let _s = msg || "";
                _s = _s.replace(/^(>*)( *)/, ">>" + "$1 ");
                console.verbose(_s);
            }
        }
    }
}

// FIXME seems like this is not effective to avoid OOM @ Dec 3, 2019
function _reclaim() {
    for (let i = 0, len = arguments.length; i < len; i += 1) {
        let img = arguments[i];
        if (images.isImageWrapper(img)) {
            img.recycle();
        }
        /*
            `img = null;` is not necessary
            as which only modified the point
            of this reference typed argument
         */
    }
}

// monster function(s) //

// updated: Jun 3, 2020
function _getDisplay(global_assign, params) {
    let $_flag = global.$$flag = global.$$flag || {};
    let _par, _glob_asg;
    if (typeof global_assign === "boolean") {
        _par = params || {};
        _glob_asg = global_assign;
    } else {
        _par = global_assign || {};
        _glob_asg = _par.global_assign;
    }

    let _waitForAction = typeof waitForAction === "undefined"
        ? waitForActionRaw
        : waitForAction;
    let _debugInfo = (m, fg) => (typeof debugInfo === "undefined"
        ? debugInfoRaw
        : debugInfo)(m, fg, _par.debug_info_flag);

    let _W, _H;
    let _disp = {};
    let _metrics = new android.util.DisplayMetrics();
    let _win_svc = context.getSystemService(context.WINDOW_SERVICE);
    let _win_svc_disp = _win_svc.getDefaultDisplay();
    _win_svc_disp.getRealMetrics(_metrics);

    if (!_waitForAction(() => _disp = _getDisp(), 3e3, 500)) {
        console.error("device.getDisplay()返回结果异常");
        return {cX: cX, cY: cY, cYx: cYx};
    }
    _showDisp();
    _assignGlob();
    return Object.assign(_disp, {cX: cX, cY: cY, cYx: cYx});

    // tool function(s) //

    function cX(num, base) {
        return _cTrans(1, +num, base);
    }

    function cY(num, base) {
        return _cTrans(-1, +num, base);
    }

    function cYx(num, base) {
        num = +num;
        base = +base;
        if (num >= 1) {
            if (!base) {
                base = 720;
            } else if (base < 0) {
                if (!~base) {
                    base = 720;
                } else if (base === -2) {
                    base = 1080;
                } else {
                    throw Error(
                        "can not parse base param for cYx()"
                    );
                }
            } else if (base < 5) {
                throw Error(
                    "base and num params should " +
                    "both be pixels for cYx()"
                );
            }
            return Math.round(num * _W / base);
        }

        if (!base || !~base) {
            base = 16 / 9;
        } else if (base === -2) {
            base = 21 / 9;
        } else if (base < 0) {
            throw Error(
                "can not parse base param for cYx()"
            );
        } else {
            base = base < 1 ? 1 / base : base;
        }
        return Math.round(num * _W * base);
    }

    function _cTrans(dxn, num, base) {
        let _full = ~dxn ? _W : _H;
        if (isNaN(num)) {
            throw Error("can not parse num param for cTrans()");
        }
        if (Math.abs(num) < 1) {
            return Math.min(Math.round(num * _full), _full);
        }
        let _base = base;
        if (!base || !~base) {
            _base = ~dxn ? 720 : 1280;
        } else if (base === -2) {
            _base = ~dxn ? 1080 : 1920;
        }
        let _ct = Math.round(num * _full / _base);
        return Math.min(_ct, _full);
    }

    function _showDisp() {
        if ($_flag.debug_info_avail && !$_flag.display_params_got) {
            _debugInfo("屏幕宽高: " + _W + " × " + _H);
            _debugInfo("可用屏幕高度: " + _disp.USABLE_HEIGHT);
            $_flag.display_params_got = true;
        }
    }

    function _getDisp() {
        try {
            _W = _win_svc_disp.getWidth();
            _H = _win_svc_disp.getHeight();
            if (!(_W * _H)) {
                throw Error();
            }

            // if the device is rotated 90 degrees counter-clockwise,
            // to compensate rendering will be rotated by 90 degrees clockwise
            // and thus the returned value here will be Surface#ROTATION_90
            // 0: 0°, device is portrait
            // 1: 90°, device is rotated 90 degree counter-clockwise
            // 2: 180°, device is reverse portrait
            // 3: 270°, device is rotated 90 degree clockwise
            let _SCR_O = _win_svc_disp.getRotation();
            let _is_scr_port = ~[0, 2].indexOf(_SCR_O);
            // let _MAX = +_win_svc_disp.maximumSizeDimension;
            let _MAX = Math.max(_metrics.widthPixels, _metrics.heightPixels);

            let [_UH, _UW] = [_H, _W];
            let _dimen = (name) => {
                let resources = context.getResources();
                let resource_id = resources.getIdentifier(name, "dimen", "android");
                if (resource_id > 0) {
                    return resources.getDimensionPixelSize(resource_id);
                }
                return NaN;
            };

            _is_scr_port ? [_UH, _H] = [_H, _MAX] : [_UW, _W] = [_W, _MAX];

            return {
                WIDTH: _W,
                USABLE_WIDTH: _UW,
                HEIGHT: _H,
                USABLE_HEIGHT: _UH,
                screen_orientation: _SCR_O,
                status_bar_height: _dimen("status_bar_height"),
                navigation_bar_height: _dimen("navigation_bar_height"),
                navigation_bar_height_computed: _is_scr_port ? _H - _UH : _W - _UW,
                action_bar_default_height: _dimen("action_bar_default_height"),
            };
        } catch (e) {
            try {
                _W = +device.width;
                _H = +device.height;
                return _W && _H && {
                    WIDTH: _W,
                    HEIGHT: _H,
                    USABLE_HEIGHT: Math.trunc(_H * 0.9),
                };
            } catch (e) {
            }
        }
    }

    function _assignGlob() {
        if (_glob_asg) {
            Object.assign(global, {
                W: _W, WIDTH: _W,
                halfW: Math.round(_W / 2),
                uW: _disp.USABLE_WIDTH,
                H: _H, HEIGHT: _H,
                uH: _disp.USABLE_HEIGHT,
                scrO: _disp.screen_orientation,
                staH: _disp.status_bar_height,
                navH: _disp.navigation_bar_height,
                navHC: _disp.navigation_bar_height_computed,
                actH: _disp.action_bar_default_height,
                cX: cX, cY: cY, cYx: cYx,
            });
        }
    }

    // raw function(s) //

    function waitForActionRaw(cond_func, time_params) {
        let _cond_func = cond_func;
        if (!cond_func) return true;
        let classof = o => Object.prototype.toString.call(o).slice(8, -1);
        if (classof(cond_func) === "JavaObject") _cond_func = () => cond_func.exists();
        let _check_time = typeof time_params === "object" && time_params[0] || time_params || 10e3;
        let _check_interval = typeof time_params === "object" && time_params[1] || 200;
        while (!_cond_func() && _check_time >= 0) {
            sleep(_check_interval);
            _check_time -= _check_interval;
        }
        return _check_time >= 0;
    }

    function debugInfoRaw(msg, info_flag) {
        if (info_flag) console.verbose((msg || "").replace(/^(>*)( *)/, ">>" + "$1 "));
    }
}

// updated: Jan 13, 2020
function _debugInfo(msg, info_flag, forcible_flag) {
    let $_flag = global.$$flag = global.$$flag || {};

    let _showSplitLine = typeof showSplitLine === "undefined" ? showSplitLineRaw : showSplitLine;
    let _messageAction = typeof messageAction === "undefined" ? messageActionRaw : messageAction;

    let global_flag = $_flag.debug_info_avail;
    if (!global_flag && !forcible_flag) return;
    if (global_flag === false || forcible_flag === false) return;

    let classof = o => Object.prototype.toString.call(o).slice(8, -1);

    if (typeof msg === "string" && msg.match(/^__split_line_/)) msg = setDebugSplitLine(msg);

    let info_flag_str = (info_flag || "").toString();
    let info_flag_msg_level = +(info_flag_str.match(/\d/) || [0])[0];

    if (info_flag_str.match(/Up/)) _showSplitLine();
    if (info_flag_str.match(/both|up/)) debugInfo("__split_line__" + (info_flag_str.match(/dash/) ? "dash" : ""), "", forcible_flag);

    if (classof(msg) === "Array") msg.forEach(msg => debugInfo(msg, info_flag_msg_level, forcible_flag));
    else _messageAction((msg || "").replace(/^(>*)( *)/, ">>" + "$1 "), info_flag_msg_level);

    if (info_flag_str.match("both")) debugInfo("__split_line__" + (info_flag_str.match(/dash/) ? "dash" : ""), "", forcible_flag);

    // raw function(s) //

    function showSplitLineRaw(extra_str, style) {
        let _extra_str = extra_str || "";
        let _split_line = "";
        if (style === "dash") {
            for (let i = 0; i < 17; i += 1) _split_line += "- ";
            _split_line += "-";
        } else {
            for (let i = 0; i < 33; i += 1) _split_line += "-";
        }
        return ~console.log(_split_line + _extra_str);
    }

    function messageActionRaw(msg, lv, if_toast) {
        let _s = msg || " ";
        if (lv && lv.toString().match(/^t(itle)?$/)) {
            let _par = ["[ " + msg + " ]", 1, if_toast];
            return messageActionRaw.apply({}, _par);
        }
        let _lv = +lv;
        if (if_toast) {
            toast(_s);
        }
        if (_lv >= 3) {
            if (_lv >= 4) {
                console.error(_s);
                if (_lv >= 8) {
                    exit();
                }
            } else {
                console.warn(_s);
            }
            return;
        }
        if (_lv === 0) {
            console.verbose(_s);
        } else if (_lv === 1) {
            console.log(_s);
        } else if (_lv === 2) {
            console.info(_s);
        }
        return true;
    }

    // tool function(s) //

    function setDebugSplitLine(msg) {
        let _msg = "";
        if (msg.match(/dash/)) {
            for (let i = 0; i < 17; i += 1) _msg += "- ";
            _msg += "-";
        } else {
            for (let i = 0; i < 33; i += 1) _msg += "-";
        }
        return _msg;
    }
}

// updated: May 5, 2020
function _runJsFile(file_name, e_args) {
    let _path = files.path(file_name.match(/\.js$/) ? file_name : (file_name + ".js"));
    if (e_args) {
        return engines.execScriptFile(_path, {arguments: e_args});
    }
    return app.startActivity({
        action: "VIEW",
        packageName: context.packageName,
        className: "org.autojs.autojs.external.open.RunIntentActivity",
        data: "file://" + _path,
    });
}

// updated: Jun 3, 2020
function _timeRecorder(keyword, operation, divisor, fixed, suffix, override_timestamp) {
    global["_$_ts_rec"] = global["_$_ts_rec"] || {};
    let records = global["_$_ts_rec"];
    if (!operation || operation.toString().match(/^(S|save|put)$/)) {
        return records[keyword] = +new Date();
    }

    divisor = divisor || 1;

    let forcible_fixed_num_flag = false;
    if (typeof fixed === "object" /* array */) forcible_fixed_num_flag = true;

    let prefix = "";
    let result = +(override_timestamp || new Date()) - records[keyword]; // number

    if (divisor !== "auto") {
        suffix = suffix || "";
        result = result / divisor;
    } else {
        suffix = suffix || "$$ch";
        fixed = fixed || [2];
        forcible_fixed_num_flag = true;

        let getSuffix = (unit_str) => ({
            ms$$ch: "毫秒", ms$$en: "ms ",
            sec$$ch: "秒", sec$$en: "s ",
            min$$ch: "分钟", min$$en: "m ",
            hour$$ch: "小时", hour$$en: "h ",
            day$$ch: "天", day$$en: "d ",
        })[unit_str + suffix];

        let base_unit = {
            ms: 1,
            get sec() {
                return 1e3 * this.ms;
            },
            get min() {
                return 60 * this.sec;
            },
            get hour() {
                return 60 * this.min;
            },
            get day() {
                return 24 * this.hour;
            }
        };

        if (result >= base_unit.day) {
            let _d = ~~(result / base_unit.day);
            prefix += _d + getSuffix("day");
            result %= base_unit.day;
            let _h = ~~(result / base_unit.hour);
            if (_h) prefix += _h + getSuffix("hour");
            result %= base_unit.hour;
            let _min = ~~(result / base_unit.min);
            if (_min) {
                result /= base_unit.min;
                suffix = getSuffix("min");
            } else {
                result %= base_unit.min;
                result /= base_unit.sec;
                suffix = getSuffix("sec");
            }
        } else if (result >= base_unit.hour) {
            let _hr = ~~(result / base_unit.hour);
            prefix += _hr + getSuffix("hour");
            result %= base_unit.hour;
            let _min = ~~(result / base_unit.min);
            if (_min) {
                result /= base_unit.min;
                suffix = getSuffix("min");
            } else {
                result %= base_unit.min;
                result /= base_unit.sec;
                suffix = getSuffix("sec");
            }
        } else if (result >= base_unit.min) {
            let _min = ~~(result / base_unit.min);
            prefix += _min + getSuffix("min");
            result %= base_unit.min;
            result /= base_unit.sec;
            suffix = getSuffix("sec");
        } else if (result >= base_unit.sec) {
            result /= base_unit.sec;
            suffix = getSuffix("sec");
        } else {
            result /= base_unit.ms; // yes, i have OCD [:wink:]
            suffix = getSuffix("ms");
        }
    }

    if (typeof fixed !== "undefined" && fixed !== null) {
        result = result.toFixed(+fixed);  // string
    }

    if (forcible_fixed_num_flag) result = +result;
    suffix = suffix.toString().replace(/ *$/g, "");

    let _res;
    if (!prefix) {
        _res = result + suffix;
    } else {
        _res = prefix + (result ? result + suffix : "");
    }
    return _res === "NaN" ? NaN : _res;
}