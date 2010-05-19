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

function AnkeDb() {
	return this;
}

AnkeDb.prototype = {
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
		var query = this.query;
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
	initialize: function() {
		this.db = openDatabase("Anke", "1.0", "Anke");
	},
	get_categories: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `categories`", [], function(t, res) {
				var categories = {};
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					categories[row.id] = {
						name: row['name'],
					};
				}
				callback(categories);
			});
		});
	},
	get_products: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `products`", [], function(t, res) {
				var products = {};
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					products[row.id] = {
						name: row['name'],
						price: row['price'],
						category: row['category'],
					};
				}
				callback(products);
			});
		});
	},
	get_users: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `users`", [], function(t, res) {
				var users = {};
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					users[row.id] = {
						name: row['name']
					};
				}
				callback(users);
			});
		});
	},
	get_currentUser: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "SELECT `user` FROM `userLog` "+
						  "ORDER BY id DESC LIMIT 1", [], function(t, res) {
				var currentUser = res.rows.length == 1 ?
								res.rows.item(0).user : 0;
				callback(currentUser);
			});
		});
	},
	get_inRegister: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "SELECT SUM(amount) AS x FROM `registerLog` ",
					[], function(t, res) {
				that.query(t, "SELECT SUM(`products`.`price`) AS x FROM "+
							  "`sold` LEFT JOIN `products` "+
							  "ON `products`.`id` = `sold`.`product` "+
							  "WHERE `sold`.`committed` = 1", [],
					function(t, res2) {
						var x = res.rows.item(0).x + res2.rows.item(0).x;
						if(!x) x = 0;
						callback(x);
				});
			});
		});
	},
	changeRegister: function(amount, at, callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, 'INSERT INTO `registerLog` '+
							  '(`amount`, `at`) VALUES (?, ?)',
					[amount, at], callback);
		});
	},
	add_sold: function(committed, count, product, at, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, 'INSERT INTO `sold` '+
						  '(`committed`, `count`, `product`, `at`) '+
						  'VALUES (?, ?, ?, ?)',
					[committed, count, product, at], callback);
		});
	},
	changeUser: function(id, at, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "INSERT INTO `userLog` (`at`, `user`) "+
						  "VALUES (?, ?)", [at, id], callback);
		});
	},
	add_category: function(id, name, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "INSERT INTO `categories`	(`id`, `name`)"+
					  "VALUES (?, ?)", [id, name], callback);
		});
	},
	add_user: function(id, name, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "INSERT INTO `users`"+
						  "(`id`, `name`)"+
						  "VALUES (?, ?)",
						  [id, name], callback);
		});
	},
	add_product: function(id, name, price, category, callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "INSERT INTO `products`"+
						  "(`id`, `name`, `price`, `category`)"+
						  "VALUES (?, ?, ?, ?)",
						  [id, name, price, category], callback);
		});
	},
	commitOrder: function(callback) {
		var that = this;
		this.db.transaction(function(t){
			that.query(t, "UPDATE `sold` SET `committed`=1 WHERE `committed`=0",
						[], callback);
		});
	},
	get_userLog: function(callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "SELECT * FROM `userLog` ", [], callback);
		});
	},
	get_registerLog: function(callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "SELECT * FROM `registerLog` ", [], callback);
		});
	},
	get_sold: function(callback) {
		var that = this;
		this.db.transaction(function(t) {
			that.query(t, "SELECT * FROM `sold` ", [], callback);
		});
	}
}

function AnkeUI(main) {
	this.showingOrder = false;
	this.catCounters = {};
	this.prodCounters = {};
	this.catDivs = [];
	this.main = main;
	return this;
}

AnkeUI.prototype = {
	initialize: function() {
		(function(that){
			$('.submit', '#register').addClass('ourTouch').data('touch',
								'on_changeRegister_tap');
			$('#send').addClass('ourTouch').data('touch',
								'on_sendTransactions_tap');
			$('.order li').addClass('ourTouch').data('touch',
								'on_commitOrder_tap');
			$('.ourTouch').tap(function(evt, data) {
				var $t = $(this);
				var id = parseInt($t.data('id'));
				if($t.data('touch'))
					that[$t.data('touch')](that, id, evt, data);
			});
			$('.ourTouch').swipe(function(evt, data) {
				var $t = $(this);
				var id = parseInt($t.data('id'));
				if($t.data('swipe'))
					that[$t.data('swipe')](that, id, evt, data);
			});
		})(this);
		$('.gotOrder').hide();
		$('.catCounter').hide().css('backgroundColor', 'red');
	},
	updateRegister: function(inRegister) {
		$('.inRegister').html(price(inRegister));
	},
	updateOrder: function(inOrder){
		if(inOrder > 0 && !this.showingOrder) {
			$('.gotOrder').show();
			$('.gotNoOrder').hide();
			this.showingOrder = true;
		} else if(inOrder == 0 && this.showingOrder) {
			$('.gotOrder').hide();
			$('.gotNoOrder').show();
			this.showingOrder = false;
	    }
		$('.inOrder').html(price(inOrder));
	},
	updateCategoryCounter: function(id, count) {
		if(!(id in this.catCounters)) this.catCounters[id] = 0;
		var previous = this.catCounters[id];
		if(count == previous) return;
		this.catCounters[id] = count;
		var s = $('.catCounter', '#catli-'+id);
		if(count > 0) {
			s.text(count.toString());
			if(previous ==  0) {
				s.addClass('counter');
				s.show();
			}
		} else if(previous > 0) {
			s.hide();
			s.removeClass('counter');
		}
	},
	updateProductCounter: function(id, count, orderCount) {
		if(!(id in this.prodCounters)) this.prodCounters[id] = [0, 0];
		var pCount = this.prodCounters[id][0];
		var pOrderCount = this.prodCounters[id][1];
		if(pCount == count && pOrderCount == orderCount) return;
		this.prodCounters[id] = [count, orderCount];
		var t = count.toString();
		var s = $('.counter', '#prod-'+id);
		if(orderCount > 0)
			t += '+' + orderCount.toString();
		if(pOrderCount == 0 && orderCount > 0)
			s.css('backgroundColor', 'red')
		else if(pOrderCount > 0 && orderCount == 0)
			s.css('backgroundColor', null)
		s.text(t);
	},
	updateUser: function(user) {
		$('.user').text(user.name);
	},
	updateProductMenu: function(categories, products) {
		if(!this.catDivs) this.catDivs = [];
		$.each(this.catDivs, function(i, catDiv) { catDiv.remove(); });
		$('#catList').empty();
		for(var key in categories) {
			var cat = categories[key];
			var id = 'cat-' + key.toString();
			var li = $('#catLiTemplate').clone();
			li.attr('id', 'catli-'+key);
			$('a', li).text(cat.name);
			$('a', li).attr('href', '#'+id);
			$('#catList').append(li);
			var div = $('#catDivTemplate').clone();
			$('.order li', div).addClass('ourTouch').data('touch',
								'on_commitOrder_tap');
			div.attr('id', id);
			$('#jqt').append(div);
			this.catDivs.push(div);
		}
		for(var key in products) {
			var prod = products[key];
			var cat_id = 'cat-' + prod.category.toString();
			var id = 'prod-' + key.toString();
			var li = $('#prodLiTemplate').clone();
			li.attr('id', id);
			$('.price', li).html(price(prod.price));
			$('.name', li).text(prod.name);
			$('.counter', li).text("0");
			$('.products', '#'+cat_id).append(li);
			var sel = $('#'+id+' *, #'+id);
			sel.data('id', key)
			sel.data('touch', 'on_product_tap')
			sel.data('swipe', 'on_product_swipe')
			sel.addClass('touch');
			sel.addClass('ourTouch');
		}
	},
	updateUserMenu: function(users){	
		for(var key in users) {
			var user = users[key];
			var id = 'user-'+key
			var li = $('#userLiTemplate').clone();
			li.attr('id', id);
			li.text(user.name);
			$('#userList').append(li);
			var sel = $('#'+id);
			sel.addClass('ourTouch');
			sel.data('id', key);
			sel.data('touch', 'on_user_tap');
		}
	},
	on_changeRegister_tap: function(that) {
		var v = parseFloat($('#registerPermAmount').attr('value'));
		v = Math.floor(v * 100)
		$('#registerPermAmount').attr('value', null);
		if(!v) {
			alert("Onjuiste invoerwaarde");
			return
		};
		jQTouch.goBack('#main');
		that.main.changeRegister(v);
	},
	on_user_tap: function(that, id) {
		that.main.changeUser(id);
		jQTouch.goBack('#main');
	},
	on_product_tap: function(that, id) {
		$('#prod-'+id).stop(true, true).effect(
			'highlight', { color: 'lightgreen'});
		that.main.addToOrder(id);
	},
	on_product_swipe: function(that, id, evt, data) {
		if(data.direction == 'left' ||
		   data.direction == 'right') {
			$('#prod-'+id).stop(true, true).effect(
				'highlight', {color: 'pink'});
			that.main.cancel(id);
		}
	},
	on_sendTransactions_tap: function(that) {
		that.main.sendTransactions();
		jQTouch.goBack('#main');
	},
	on_commitOrder_tap: function(that) {
		that.main.commitOrder();
		jQTouch.goBack('#main');
	}
}

function Anke() {
	this.db = new AnkeDb();
	this.ui = new AnkeUI(this);
	this.order = {};
	this.inOrder = 0;
	return this;
}

Anke.prototype = {
	loadData: function(callback) {
		var that = this;
		var cbs = create_join(5, callback);
		this.db.get_inRegister(function(inRegister) {
			that.inRegister = inRegister; cbs[0]();
		});
		this.db.get_users(function(users) {
			that.users = users; cbs[1]();
		});
		this.db.get_products(function(products) {
			for(var id in products) products[id].count = 0;
			that.products = products; cbs[2]();
		});
		this.db.get_categories(function(categories) {
			for(var id in categories) categories[id].orderCount = 0;
			that.categories = categories; cbs[3]();
		});
		this.db.get_currentUser(function(currentUser) {
			that.currentUser = currentUser; cbs[4]();
		});
	},
	reset_productCounts: function() {
		for(var id in this.products) {
			this.products[id].count = 0;
			this.ui.updateProductCounter(id, 0,
					id in this.order ? this.order[id] : 0);
		}
	},
	_changeRegister: function(amount) {
		this.inRegister += amount;
		this.ui.updateRegister(this.inRegister);
	},
	changeRegister: function(amount) {
		this.db.changeRegister(amount, Date.now());
		this._changeRegister(amount);
	},
	_changeOrder: function(amount) {
		this.inOrder += amount;
		this.ui.updateOrder(this.inOrder);
	},
	changeOrder: function(id, count) {
		if(!(id in this.order)) this.order[id] = 0;
		this.order[id] += count;
		if(this.order[id] == 0)
			delete this.order[id];
		var cId = this.products[id].category;
		this.categories[cId].orderCount += count;
		this.ui.updateProductCounter(id, this.products[id].count,
					id in this.order ? this.order[id] : 0);
		this.ui.updateCategoryCounter(cId, this.categories[cId].orderCount);
		this._changeOrder(this.products[id].price * count);
	},
	cancel: function(id, callback) {
		var orderCount = id in this.order ? this.order[id] : 0;
		var real = orderCount == 0;
		if(real && this.products[id].count == 0)
			return;
		if(real) {	
			this.products[id].count--;
			this._changeRegister(-this.products[id].price);
			this.ui.updateProductCounter(id, this.products[id].count, 0);
		} else
			this.changeOrder(id, -1);
		this.db.add_sold(real, -1, id, Date.now(), callback)
	},
	addToOrder: function(id, callback) {
		this.changeOrder(id, 1);
		this.db.add_sold(0, 1, id, Date.now(), callback);
	},
	changeUser: function(id, callback) {
		var that = this;
		this.db.changeUser(id, Date.now(), function() {
			that.ui.updateUser(that.users[id])
			that.currenUser = id;
			that.reset_productCounts;
			if(callback) callback();
		});
	},
	fetchData:function(callback) {
		var that = this;
		$.getJSON('data.json', function(data) {
			for(var id in data.categories)
				that.db.add_category(id, data.categories[id].name);
			for(var id in data.users)
				that.db.add_user(id, data.users[id].name);
			for(var id in data.products) {
				var p = data.products[id];
				that.db.add_product(id, p.name, p.price, p.category);
			}
		});
	},
	commitOrder: function() {
		var that = this;
		var cats = new Set();
		for(var key in this.order) {
			this.products[key].count += this.order[key];
			cats.add(this.products[key].category);
			this.ui.updateProductCounter(key, this.products[key].count, 0);
		}
		cats.forEach(function(x) {
			that.categories[x].orderCount = 0;
			that.ui.updateCategoryCounter(x, 0);
		});
		this.order = {};
		this._changeRegister(this.inOrder);
		this._changeOrder(-this.inOrder);
		this.db.commitOrder();

	},
	sendTransactions: function() {
		var ret = {};
		var cbs = create_join(3, function() {
			$.post('submit.php', {data: JSON.stringify(ret)});
			console.log(ret);
		});
		this.db.get_sold(function(t, res){
			ret['sold'] = [];
			for(var i=0; i<res.rows.length; i++) {
				var row = res.rows.item(i);
				ret['sold'].push([row.id, row.at, row.count, row.committed,
									row.product]);
			}
			cbs[0]();
		});
		this.db.get_userLog(function(t, res) {
			ret['userLog'] = [];
			for(var i=0; i<res.rows.length; i++) {
				var row = res.rows.item(i);
				ret['userLog'].push([row.id, row.at, row.user]);
			}
			cbs[1]();
		});
		this.db.get_registerLog(function(t, res) {
			ret['registerLog'] = [];
			for(var i=0; i<res.rows.length; i++) {
				var row = res.rows.item(i);
				ret['registerLog'].push([row.id, row.at, row.amount]);
			}
			cbs[2]();
		});
    },
	run: function() {
		var that = this;
		this.db.initialize();
		this.ui.initialize();
		var cb = function() {
			that.loadData(function(){
				that.ui.updateProductMenu(that.categories, that.products);
				that.ui.updateUserMenu(that.users);
				that.ui.updateUser(that.users[that.currentUser]);
				that.ui.updateRegister(that.inRegister);
			});
		};
		this.db.onEmptyDb(function(){
			that.db.resetTables(function(){
				that.fetchData(function(){
					cb();
				});
			});
		}, cb);
	}
}

jQTouch = new $.jQTouch({});
var anke = new Anke;
$(document).ready(function(){anke.run();});
