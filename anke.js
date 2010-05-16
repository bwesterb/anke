/* vim: set ts=4 sw=4: */

function price(cents) {
	var t1 = Math.floor(cents / 100);
	var t2 = (cents % 100).toString();
	while(t2.length < 2) t2 = '0' + t2;
	return "&euro;" + t1 + '.' + t2;
}

function Set() {
	this.data = {}
	return this;
}

Set.prototype = {
	add: function(x) {
		this.data[x] = null;
	},
	has: function(x) {
		return x in this.data;
	},
	remove: function(x) {
		delete this.data[x];
	},
	get: function(x, def) {
		if(x in this.data)
			return this.data[x];
		return def;
	},
	extend: function(list) {
		for(var i = 0; i < list.length; i++)
			this.data[list[i]] = null;
	},
	forEach: function(callback) {
		for(var k in this.data) {
			callback(k);
		}
	}
};

function Anke() {
	return this;
}

/* 
 * Returns <n> callbacks, such that <callback> is called after all
 * returned callbacks are called.
 */
function create_join(n, callback) {
	var toRet = [];
	var done = [];
	var todo = n;
	for(var i = 0; i < n; i++) {
		done.push(false);
		(function(){
			var _i = i;
			toRet.push(function(){
				if(!done[_i]) {
					done[_i] = true;
					todo -= 1;
					if(todo == 0) {
						callback();
					}
				}
			});
		})();
	}
	return toRet;
}

Anke.prototype = {
	loadData: function(callback) {
		var that = this;
		this.products = {};
		this.categories = {};
		this.users = {};
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `categories`", [], function(t, res) {
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					that.categories[row.id] = {
						name: row['name'],
						orderCount: 0
					};
				}
			});
			that.query(t, "SELECT * FROM `products`", [], function(t, res) {
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					that.products[row.id] = {
						name: row['name'],
						price: row['price'],
						category: row['category'],
						count: 0,
						orderCount: 0
					};
				}
			});
			that.query(t, "SELECT * FROM `users`", [], function(t, res) {
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					that.users[row.id] = {
						name: row['name']
					};
				}
				that.query(t, "SELECT `user` FROM `userLog` "+
							  "ORDER BY id DESC LIMIT 1", [], function(t, res) {
					var user = res.rows.length == 1 ? res.rows.item(0).user : 0;
					that.setUser(user);
				});
			});
			that.query(t, "SELECT SUM(amount) AS x FROM `registerLog` ",
					[], function(t, res) {
				that.query(t, "SELECT SUM(`products`.`price`) AS x FROM "+
							  "`sold` LEFT JOIN `products` "+
							  "ON `products`.`id` = `sold`.`product` "+
							  "WHERE `sold`.`committed` = 1", [],
					function(t, res2) {
						var x = res.rows.item(0).x + res2.rows.item(0).x;
						if(!x) x = 0;
						that.inRegister = x;
						that.inOrder = 0;
						that.inOrder_lut = {};
				});
			});
		}, null, callback);
	},
	changeRegister: function(amount) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, 'INSERT INTO `registerLog` '+
						  '(`amount`, `at`) '+
							  'VALUES (?, ?)',
					[amount, Date.now()], function(){
				that._changeRegister(amount);
			});
		});
	},
	_changeOrder: function(amount) {
		if(this.inOrder == 0 && amount > 0) {
			$('.gotOrder').show();
			$('.gotNoOrder').hide();
		}
		this.inOrder += amount;
		if(this.inOrder == 0) {
			$('.gotOrder').hide();
			$('.gotNoOrder').show();
	    }
		$('.inOrder').html(price(this.inOrder));
	},
	_changeRegister: function(amount) {
		this.inRegister += amount;
		$('.inRegister').html(price(this.inRegister));
	},
	_refresh_categoryCount: function(id, previous) {
		var s = $('.catCounter', '#catli-'+id);
		if(this.categories[id].orderCount > 0) {
			s.text(this.categories[id].orderCount.toString());
			if(previous == 0) {
				s.addClass('counter');
				s.show();
			}
		} else {
			if(previous > 0) {
				s.hide();
				s.removeClass('counter');
			}
		}
	},
	_refresh_productCount: function(id, previous) {
		var t = this.products[id].count.toString();
		var s = $('.counter', '#prod-'+id);
		if(this.products[id].orderCount)
			t += '+' + this.products[id].orderCount.toString();
		if(previous == 0 && this.products[id].orderCount > 0)
			s.css('backgroundColor', 'red')
		if(previous > 0 && this.products[id].orderCount == 0)
			s.css('backgroundColor', null)
		s.text(t);
	},
	reset_productCounts: function() {
		for(var key in this.products) {
			this.products[key].count = 0;
			var tmp = this.products[key].orderCount;
			this.products[key].orderCount = 0;
			this._refresh_productCount(key, tmp);
		}
	},
	cancel: function(id, callback) {
		var that = this;
		var li = $('#prod-'+id.toString());
		var real = this.products[id].orderCount == 0;
		if(real && this.products[id].count == 0)
			return;
		var oldOrderCount = this.products[id].orderCount;
		if(real) {	
			this.products[id].count--;
			this._changeRegister(-this.products[id].price);
		} else {
			if(--this.products[id].orderCount == 0)
				delete this.inOrder_lut[id];
			this._refresh_categoryCount(this.products[id].category,
					this.categories[this.products[id].category].orderCount--);
			this._changeOrder(-this.products[id].price);
		}
		that._refresh_productCount(id, oldOrderCount);
		this.db.transaction(function(t) {
			that.query(t, 'INSERT INTO `sold` '+
						  '(`committed`, `count`, `product`, `at`) '+
						  'VALUES (?, ?, ?, ?)',
					[real, -1, id, Date.now()], callback);
		});
	},
	addToOrder: function(id, callback) {
		var that = this;
		var li = $('#prod-'+id.toString());
		this._refresh_categoryCount(this.products[id].category,
				this.categories[this.products[id].category].orderCount++);
		if(this.products[id].orderCount++ == 0)
			this.inOrder_lut[id] = true;
		this._changeOrder(that.products[id].price);
		this._refresh_productCount(id, this.products[id].orderCount - 1);
		this.db.transaction(function(t) {
			that.query(t, 'INSERT INTO `sold` '+
						  '(`committed`, `count`, `product`, `at`) '+
						  'VALUES (0, ?, ?, ?)',
						  [1, id, Date.now()], callback)
		});
	},
	refreshProductList: function() {
		var that = this;
		$('.inRegister').html(price(this.inRegister));
		$('.inOrder').html(price(this.inOrder));
		if(!this.catDivs) this.catDivs = [];
		$.each(that.catDivs, function(i, catDiv) { catDiv.remove(); });
		$('#catList').empty();
		for(var key in this.categories) {
			var cat = this.categories[key];
			var id = 'cat-' + key.toString();
			var li = $('#catLiTemplate').clone();
			li.attr('id', 'catli-'+key);
			$('a', li).text(cat.name);
			$('a', li).attr('href', '#'+id);
			$('#catList').append(li);
			var div = $('#catDivTemplate').clone();
			div.attr('id', id);
			$('#jqt').append(div);
			that.catDivs.push(div);
		}
		for(var key in this.products) {
			var prod = this.products[key];
			var cat_id = 'cat-' + prod.category.toString();
			var id = 'prod-' + key.toString();
			var li = $('#prodLiTemplate').clone();
			li.attr('id', id);
			$('.price', li).html(price(prod.price));
			$('.name', li).text(prod.name);
			$('.counter', li).text("0");
			$('.products', '#'+cat_id).append(li);
			(function(key, id){
			    var sel = $('#'+id+' *, #'+id);
				sel.data('prodId', key)
				sel.addClass('touch');
				sel.addClass('productTouch');
			})(key, id);
		}
		$('.productTouch').tap(function() {
			var key = parseInt($(this).data('prodId'));	
			$('#prod-'+key).stop(true, true).effect(
				'highlight', { color: 'lightgreen'});
			that.addToOrder(key, function() { });
		});
		$('.productTouch').swipe(function(evt, data) {
			var key = parseInt($(this).data('prodId'));
			if(data.direction == 'left' ||
			   data.direction == 'right') {
				that.cancel(key, function() {
					$('#prod-'+key).stop(true, true).effect(
						'highlight', {color: 'pink'});
				});
			}
		});
		for(var key in this.users) {
			var user = this.users[key];
			var id = 'user-'+key
			var li = $('#userLiTemplate').clone();
			li.attr('id', id);
			li.text(user.name);
			$('#userList').append(li);
			(function(key, id){
				$('#'+id).addClass('userTouch').data('userId', key);
			})(key, id);
		}
		$('.userTouch').tap(function(){
			var key = parseInt($(this).data('userId'));
			that.setUser(key);
			jQTouch.goBack('#main');
		});
	},
	setUser: function(id, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "INSERT INTO `userLog` (`at`, `user`) "+
						  "VALUES (?, ?)", [Date.now(), id],
				function() {
					$('.user').text(that.users[id].name);
					that.user = id;
					that.reset_productCounts();
					if(callback) callback();
				});
		});
	},
	fetchData:function(callback) {
		var that = this;
		$.getJSON('data.json', function(data) {
			that.db.transaction(function(t){
				var i = 0;
				for(var id in data.categories) {
					that.query(t, "INSERT INTO `categories`	(`id`, `name`)"+
							  "VALUES (?, ?)", [id, data.categories[id].name]);
				}
				for(var id in data.products) {
					var p = data.products[id];
					that.query(t, "INSERT INTO `products`"+
								  "(`id`, `name`, `price`, `category`)"+
								  "VALUES (?, ?, ?, ?)",
								  [id, p.name, p.price, p.category]);
				}
				for(var id in data.users) {
					var u = data.users[id];
					that.query(t, "INSERT INTO `users`"+
								  "(`id`, `name`)"+
								  "VALUES (?, ?)",
								  [id, u.name]);
				}
			}, null, callback);
		});
	},
	createMenu: function() {
		var that = this;
		$('.submit', '#register').tap(function(){
			var v = parseFloat($('#registerPermAmount').attr('value'));
			v = Math.floor(v * 100)
			$('#registerPermAmount').attr('value', null);
			if(!v) {
				alert("Onjuiste invoerwaarde");
				return
			};
			jQTouch.goBack('#main');
			that.changeRegister(v);
		});
		$('#send').tap(function(){
			that.sendTransactions();
			jQTouch.goBack('#main');
		});
		$('.gotOrder').hide();
		$('.order li').tap(function(){
			that.commitOrder();
			jQTouch.goBack('#main');
		});
		$('.catCounter').hide().css('backgroundColor', 'red');
	},
	commitOrder: function() {
		var that = this;
		this._changeRegister(this.inOrder);
		this._changeOrder(-this.inOrder);
		for(var key in this.inOrder_lut) {
			this.products[key].count += this.products[key].orderCount;
			var tmp = this.products[key].orderCount;
			this.products[key].orderCount = 0;
			this._refresh_productCount(key, tmp);
		}
		for(var key in this.categories) {
			var tmp = this.categories[key].orderCount;
			this.categories[key].orderCount = 0;
			this._refresh_categoryCount(key, tmp);
		}
		this.inOrder_lut = {};
		this.db.transaction(function(t){
			that.query(t, "UPDATE `sold` SET `committed`=1 WHERE `committed`=0",
						[]);
		});
	},
	sendTransactions: function() {
		var that = this;
		var ret = {};
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `sold` ", [],
					function(t, res) {
				ret['sold'] = [];
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					ret['sold'].push([row.id, row.at, row.count, row.committed,
					   					row.product]);
				}
			});
			that.query(t, "SELECT * FROM `userLog` ", [],
					function(t, res) {
				ret['userLog'] = [];
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					ret['userLog'].push([row.id, row.at, row.user]);
				}
			});
			that.query(t, "SELECT * FROM `registerLog` ", [],
					function(t, res) {
				ret['registerLog'] = [];
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					ret['registerLog'].push([row.id, row.at, row.amount]);
				}
			});
		}, null, function() {
			$.post('submit.php', {data: JSON.stringify(ret)});
			console.log(ret);
		});
    },
	connectDb: function() {
		this.db = openDatabase("Anke", "1.0", "Anke");
	},
	query: function(t, query, args, success, failure) {
		console.log(query);
		if(!failure) {
			failure = function() {
				console.log("Query failed: " + query);
			}
		}
		t.executeSql(query, args, success, failure);
	},
	resetTables: function(callback) {
		query = this.query;
		this.db.transaction(function(t){
			var cbs = create_join(7, function() {
				var cbs2 = create_join(7, callback);
				query(t, 'CREATE TABLE `categories` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   name TEXT)', [], cbs2[0]);
				query(t, 'CREATE TABLE `products` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   price INT,'+
						 '   category INT,'+
						 '   name TEXT)', [], cbs2[1]);
				query(t, 'CREATE TABLE `sold` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   at INTEGER,'+
						 '   count INTEGER,'+
						 '   committed INTEGER,'+
						 '   product INTEGER)', [], cbs2[2]);
				query(t, 'CREATE INDEX sold_committed '+
						 'ON `sold` (committed)', [], cbs2[3]);
				query(t, 'CREATE TABLE `users` ('+
				         '   id INTEGER PRIMARY KEY,'+
				         '   name INTEGER)', [], cbs2[4]);
				query(t, 'CREATE TABLE `registerLog` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   at INTEGER,'+
						 '   amount INTEGER)', [], cbs2[5]);
				query(t, 'CREATE TABLE `userLog` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   at INTEGER,'+
						 '   user INTEGER)', [], cbs2[6]);
			});
			query(t, 'DROP TABLE IF EXISTS `categories`', [], cbs[0]);
			query(t, 'DROP TABLE IF EXISTS `sold`', [], cbs[1]);
			t.executeSql('DROP TABLE IF EXISTS `products`', [], cbs[2]);
			t.executeSql('DROP INDEX IF EXISTS sold_committed', 
							[], cbs[3]);
			t.executeSql('DROP TABLE IF EXISTS `users`', [], cbs[4]);
			t.executeSql('DROP TABLE IF EXISTS `userLog`', [], cbs[5]);
			t.executeSql('DROP TABLE IF EXISTS `registerLog`', [], cbs[6]);
		});
	},
	onEmptyDb: function(onEmpty, onNotEmpty) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, 'select count(*) from `sold`', [],
				onNotEmpty, onEmpty);
		});
	},
	run: function() {
		var that = this;
		this.connectDb();
		var cb = function() {
			that.loadData(function(){
				that.refreshProductList();
			});
		};
		this.onEmptyDb(function(){
			that.resetTables(function(){
				that.fetchData(function(){
					cb();
				});
			});
		}, cb);
		this.createMenu();
	}
}

jQTouch = new $.jQTouch({});
var anke = new Anke;
$(document).ready(function(){anke.run();});
