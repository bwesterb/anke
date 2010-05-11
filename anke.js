/* vim: set ts=4 sw=4: */

function price(cents) {
	return "&euro;" + (cents / 100.0).toFixed(2);
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
	refreshProductList: function() {
		var that = this;
		if(!this.catDivs) this.catDivs = [];
		this.db.transaction(function(t){
			that.query(t, "SELECT * FROM `categories`", [], function(t, res) {
				$.each(that.catDivs, function(i, catDiv) { catDiv.remove(); });
				$('#catList').empty();
				for(var i=0; i<res.rows.length; i++) {
					var row = res.rows.item(i);
					var id = 'cat-' + row['id'].toString();
					var li = $('#catLiTemplate').clone();
					li.attr('id', null);
					$('a', li).text(row['name']);
					$('a', li).attr('href', '#'+id);
					$('#catList').append(li);
					var div = $('#catDivTemplate').clone();
					div.attr('id', id);
					$('h1', div).text(row['name']);
					$('body').append(div);
					that.catDivs.push(div);
				}
				that.query(t, "SELECT * FROM `products`", [], function(t, res) {
					for(var i=0; i<res.rows.length; i++) {
						var row = res.rows.item(i);
						var id = 'cat-' + row['category'].toString();
						var li = $('#prodLiTemplate').clone();
						li.attr(id, 'prod-'+row['id'].toString());
						$('.price', li).html(price(row['price']));
						$('.name', li).text(row['name']);
						$('.count', li).text("0");
						$('.products', '#'+id).append(li);
					}
				});
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
				that.refreshProductList();
			});
		});
		this.createMenu();
	}
}

new $.jQTouch({});
var anke = new Anke;
$(document).ready(function(){anke.run();});
