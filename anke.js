/* vim: set ts=4 sw=4: */

function price(cents) {
	var t1 = Math.floor(cents / 100);
	var t2 = (cents % 100).toString();
	while(t2.length < 2) t2 = '0' + t2;
	return "&euro;" + t1 + '.' + t2;
}

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
					that.categories[row.id] = { name: row['name'] };
				}
			});
			that.query(t, "SELECT * FROM `products`", [], function(t, res) {
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					that.products[row.id] = {
						name: row['name'],
						price: row['price'],
						category: row['category']
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
			});
			that.query(t, "SELECT SUM(amount) AS x FROM `transactions` "+
						  "WHERE cancelled=1", [], function(t, res) {
				var x = res.rows.item(0).x;
				if(!x) x = 0;
				that.inRegister = x;
			});
		}, null, callback);
	},
	refreshProductList: function() {
		var that = this;
		$('.inRegister').html(price(this.inRegister));
		if(!this.catDivs) this.catDivs = [];
		$.each(that.catDivs, function(i, catDiv) { catDiv.remove(); });
		$('#catList').empty();
		for(var key in this.categories) {
			var cat = this.categories[key];
			var id = 'cat-' + key.toString();
			var li = $('#catLiTemplate').clone();
			li.attr('id', null);
			$('a', li).text(cat.name);
			$('a', li).attr('href', '#'+id);
			$('#catList').append(li);
			var div = $('#catDivTemplate').clone();
			div.attr('id', id);
			$('body').append(div);
			that.catDivs.push(div);
		}
		for(var key in this.products) {
			var prod = this.products[key];
			var id = 'cat-' + prod.category.toString();
			var li = $('#prodLiTemplate').clone();
			li.attr(id, 'prod-'+key.toString());
			$('.price', li).html(price(prod.price));
			$('.name', li).text(prod.name);
			$('.count', li).text("0");
			$('.products', '#'+id).append(li);
		}
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
		$('#menuList').append($('<li/>', {
				'text': 'Fetch products',
				'click': function() {
					that.clearProducts(function(){
						that.fetchProducts(function(){
							that.refreshProductList();
						});
					}); }
				}));
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
			var cbs = create_join(4, function() {
				var cbs2 = create_join(4, callback);
				query(t, 'CREATE TABLE `categories` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   name TEXT)', [], cbs2[0]);
				query(t, 'CREATE TABLE `products` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   price INT,'+
						 '   category INT,'+
						 '   name TEXT)', [], cbs2[1]);
				query(t, 'CREATE TABLE `transactions` ('+
						 '   id INTEGER PRIMARY KEY,'+
						 '   at DATETIME,'+
						 '   amount INTEGER,'+
						 '   cancelled INTEGER,'+
						 '   user INTEGER,'+
						 '   product INTEGER)', [], cbs2[2]);
				query(t, 'CREATE TABLE `users` ('+
				         '   id INTEGER PRIMARY KEY,'+
				         '   name INTEGER)', [], cbs2[3]);
			});
			query(t, 'DROP TABLE IF EXISTS `categories`', [], cbs[0]);
			query(t, 'DROP TABLE IF EXISTS `transactions`', [], cbs[1]);
			t.executeSql('DROP TABLE IF EXISTS `products`', [], cbs[2]);
			t.executeSql('DROP TABLE IF EXISTS `users`', [], cbs[3]);
		});
	},
	run: function() {
		var that = this;
		this.connectDb();
		this.resetTables(function(){
			that.fetchData(function(){
				that.loadData(function(){
					that.refreshProductList();
				});
			});
		});
		this.createMenu();
	}
}

new $.jQTouch({});
var anke = new Anke;
$(document).ready(function(){anke.run();});
