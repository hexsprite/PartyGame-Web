/**
 * @author Benjamin S. Berman
 * Copyright 2012
 */

var GAME = "currentGame";
var ROUND = "currentRound";
var SUBMISSION = "currentSubmission";
var ERROR = "currentError";
var PREVIEW_CARD = "currentPreviewCard";
var LOCATION = "currentLocation";
var IS_LOGGED_IN = "isLoggedIn";
var IS_CORDOVA = "isCordova";

var previewYes = function () {};
var previewNo = function () {};

var mutationObserver = {};

var refreshListviews = function() {
	$('.ui-listview[data-role="listview"]').listview("refresh");
	$('[data-role="button"]:visible').button();
};

var createListviews = function() {
	$('[data-role="listview"]').listview();
};

var setError = function(err,r) {
	if (err) {
		Session.set(ERROR,err.reason);
		console.log(err);
	}
};

var setErrorAndGoHome = function (err,r) {
	setError(err,r);
	
	$.mobile.changePage('#home');
};

var loggedIn = function() {
    return Session.get(IS_LOGGED_IN) !== null;
};

var requestLocation = function(callback) {
    if (navigator && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(r){
            var callbackR = [r.coords.latitude, r.coords.longitude];
            Session.set(LOCATION,callbackR);
            if (callback)
                callback(undefined,callbackR);
        }, function(e){
            if (callback)
                callback(new Meteor.Error(400,"Geolocation failed",e),null);
        });
    } else {
        if (callback)
            callback(new Meteor.Error(404,"Geolocation not supported."),null)
    }
};

var closeThisGame = function() {
	if (!Session.get(GAME)) {
		console.log("Not in a game.");
		return;
	}
	
	Meteor.call("closeGame",Session.get(GAME),setError);
};

var kickThisPlayer = function(kickId) {
	if (!Session.get(GAME)) {
		console.log("Not in a game.");
		return;
	}
	
	Meteor.call("kickPlayer",Session.get(GAME),kickId,function(err,r) {
		setError(err);
		if (r)
			setError({reason:"Player kicked."});
	});
};

var quitThisGame = function() {
	if (!Session.get(GAME)) {
		console.log("Not in a game.");
		return;
	}
	
	Meteor.call("quitGame",Session.get(GAME),setError);
};

var login = function() {
	var loginUsernameOrEmail = $('#loginUsernameOrEmail').attr('value');
	var password = $('#loginPassword').attr('value');
	
	Meteor.loginWithPassword(loginUsernameOrEmail,password,setErrorAndGoHome);
};

var loginAnonymously = function() {
    var nickname = $('#anonymousNickname').attr('value');
    createNewAnonymousUser(nickname,setErrorAndGoHome);
};

var loginWithFacebook = function() {
	Meteor.loginWithFacebook({},setErrorAndGoHome)
};

var loginWithGoogle = function() {
	Meteor.loginWithGoogle({},setErrorAndGoHome)
};

var signUp = function() {
	if (Meteor.user()) {
		Session.set(ERROR,"You are already logged in!");
		return;
	}
	
	var username = $('#signUpUsername').attr('value');
	var email = $('#signUpEmail').attr('value');
	var password = $('#signUpPassword').attr('value');

	createNewUserAndLogin(username,email,password,function(err){
		if (err) {
			Session.set(ERROR,err.reason);
			console.log(err);
		} else {
			$.mobile.changePage('#home');
		}
	});
};

var matchMake = function() {
    match(Session.get(LOCATION),function (err,r){
        if (r) {
            Session.set(GAME,r);
        }
        setError(err);
    });
};

var submissionCount = function () {
    return Submissions.find({gameId:Session.get(GAME),round:Session.get(ROUND)}).count();
};

var maxSubmissionsCount = function () {
    var gameId = Session.get(GAME);
    if (gameId) {
        return Players.find({gameId:gameId,connected:true}).count()-1;
    } else {
        return 0;
    }
};

var playersCount = function () {
    var gameId = Session.get(GAME);
    if (gameId)
        return Players.find({gameId:gameId}).count();
    else
        return 0;
};

var playersRemainingCount = function () {
    var _maxSubmissionsCount = maxSubmissionsCount();
    if (_maxSubmissionsCount > 0)
        return "(" + submissionCount().toString() + "/" + _maxSubmissionsCount.toString() + ")";
    else
        return "";
};

var createAndJoinGame = function() {
	var gameTitle = $('#gameTitle').attr('value');
	var gamePassword = $('#gamePassword').attr('value');
	
	if (!gameTitle || gameTitle == "") {
		Session.set(ERROR,"Cannot create a game with an empty title!");
		return;
	}
	
	// reenable password when there's a way to join a game with passwords
	Meteor.call("createEmptyGame",gameTitle,"",Session.get(LOCATION),function(e,r){
		if (r) { // new game id returned
			Meteor.call("joinGame",r,function(e2,r2){
				if (r2) {
					Session.set(GAME,r2);
					$.mobile.changePage('#game');
				}
				if (e2) {
					Session.set(ERROR,e2.reason || e.reason + ", " + e2.reason);
					console.log(e2);
				}
			});
		}
		setError(e);
	});
};

var playerIdForUserId = function(userId,gameId) {
    userId = userId || Meteor.userId();
    gameId = gameId || Session.get(GAME);
    var p = Players.find({gameId:gameId,userId:userId},{reactive:false}).fetch();

    if (p && p[0]) {
        return p[0]._id;
    } else {
        throw new Meteor.Error(404,"Player not found for given userId " + userId.toString() + " and gameId " + gameId.toString());
    }
};

var playerIdToName = function(id) {
    var p = Players.findOne({_id:id},{reactive:false});

    if (!p)
        return "(Anonymous)";

    return p.name;
};

var cardIdToText = function(cardId) {
    var c = Cards.findOne({_id:cardId});
    if (c)
        return c.text;
    else
        return "(Waiting for players to submit...)";
};

var submissionIdToCardId = function(id) {
    var submission = Submissions.findOne({_id:id});
    if (submission.answerId)
        return submission.answerId;
    else
        return "";
};

// Match into an existing game, or create a new one to join into
var match = function(location,gameJoinedCallback) {
    Meteor.call("findLocalGame",location,function(e,r) {
        if (r)
            Meteor.call("joinGame",r,gameJoinedCallback);
        else
            Meteor.call("findGameWithFewPlayers",function(e,r){
                if (r)
                    Meteor.call("joinGame",r,gameJoinedCallback);
                else
                    Meteor.call("createEmptyGame","","",location,function (e,r){
                        if (r)
                            Meteor.call("joinGame",r,gameJoinedCallback);
                        else
                            console.log(e);
                    });
            });
    });
};

// get a {playerId, score} dictionary containing the current scores
var scores = function(gameId) {
    var scores = {};

    try {
        Players.find({gameId:gameId}).forEach(function (p) {
            scores[p._id] = {score:0,connected:p.connected,name: p.name};
        });

        // compute all the scores
        Votes.find({gameId:gameId}).forEach(function(voteDoc) {
            scores[voteDoc.playerId].score += 1;
        });

        return _.map(scores,function (value,key){
            return {playerId:key,score:value.score,connected:value.connected,name:value.name};
        });
    } catch(e) {
        return false;
    }
};

var createNewUserAndLogin = function(username,email,password,callback) {
    if (username && email && password) {
        Accounts.createUser({username:username,email:email,password:password},callback);
    } else {
        throw new Meteor.Error(403,"Please fill out: " + (username ? "" : " username") + (email ? "" : " email") + (password ? "" : " password")+".");
    }
};

var createNewAnonymousUser = function(nickname,callback) {
    var userIdPadding = Math.random().toString(36).slice(-8);
    var password = Math.random().toString(36).slice(-8);
    nickname = nickname || "REDACTED (" + userIdPadding + ")";
    Accounts.createUser({username:"Anonymous " + userIdPadding, password:password, profile:{name:nickname}},callback)
};

var questionAndAnswerText = function(questionCardId,answerCardId) {
    var q = cardIdToText(questionCardId);
    var c = cardIdToText(answerCardId);

    if (!c || !q || q === "(Waiting for players to submit...)" || c === "(Waiting for players to submit...)") {
        return "(Waiting for players to submit...)";
    }

    var matches = [];
    var match = /(.{0,2})(__)(.+)/g;
    var isName = /^[A-Z]\w+\s+[A-Z]/;

    var beforeAndAfter = match.exec(q);

    // Handle multiple underscores
    while (beforeAndAfter) {
        // clone array into matches
        matches.push(beforeAndAfter.slice(0));
        beforeAndAfter = match.exec(q);
    }

    var replacements = _.map(matches, function (anUnderscore) {
        if (c && anUnderscore && anUnderscore[2]) {
            var before = anUnderscore[1];
            var startsWithPeriod = /[\.\?!]\s/;

            // check if the card text should be lowercase
            if (before != "" && !startsWithPeriod.exec(before) && !isName.exec(c)) {
                c = c.charAt(0).toLowerCase() + c.slice(1);
            }

            // check if the triple underscore ends with a punctuation

            var after = anUnderscore[3];

            // since there is stuff after, remove punctuation.
            if (after) {
                var punctuation = /[^\w\s]/;

                // if the card text ends in punctuation, remove any existing punctuation
                if (punctuation.exec(after))
                    c = c.slice(0,c.length-1);
            }

            return "<span style='font-style:italic;'>"+c+"</span>";
        }
    });

    if (replacements && replacements.length > 0) {
        return _.reduce(replacements,function(memo,text) {
            return memo.replace("__",text);
        },q);
    } else {
        return q + " " + "<span style='font-style:italic;'>"+c+"</span>";
    }
};

var joinGameOnClick = function(e) {
	var gameId = $(e.target).attr('id');
	Meteor.call("joinGame",gameId,function(e,r) {
		if (r) {
			Session.set(GAME,r);
		}
		setError(e);
	});
};

var isJudge = function() {
    var currentGameId = Session.get(GAME);
    var playerId = getPlayerId(currentGameId,Meteor.userId());
    var g = Games.findOne({_id:currentGameId});

    if (g && playerId)
        return (EJSON.equals(playerId, g.judgeId));
    else
        return false;
};

var defaultPreserve = {
    'li[id]':function(node) {
        return node.id;
    }
};

var acceptInvite = function() {

};

var loginAndAcceptInvite = function() {

};

var joinGameFromHash = function() {
    // TODO Create dialog to ask for nickname, then join into game.
    var url = window.location.href;
    var gameId = /\?([A-z0-9\-])#+/.exec(url)[1];

    if (!Meteor.user()) {

    }
};

var registerTemplates = function() {	
	Handlebars.registerHelper("questionAndAnswerText",questionAndAnswerText);
	Handlebars.registerHelper("playerIdToName",playerIdToName);
	Handlebars.registerHelper("refreshListviews",refreshListviews);
    Handlebars.registerHelper("loggedIn",loggedIn);
	Handlebars.registerHelper("connectionStatus",function () {
		var status = Meteor.status().status;
		if (status == "connected") {
			return false;
		} else if (status == "connecting") {
			return "Connecting to server...";
		} else if (status == "waiting") {
			return "Failed to connect. Retrying connection...";
		}
	});
	Handlebars.registerHelper("isCordova",function () {
        if (Session.get(IS_CORDOVA))
            return true;
        else
            return false;
    });

	Template.error.error = function() {
		return Session.get(ERROR);
	};
	
	Template.game.game = function () {
		return Games.findOne({_id:Session.get(GAME)});
	};
	
	Template.game.title = function() {
		var g = Games.findOne({_id:Session.get(GAME)});
		if (g)
			return g.title;
		else
			return "REDACTED.";
	};
	
	Template.game.round = function() {
		var g = Games.findOne({_id:Session.get(GAME)});
		if (g)
			return g.round+1;
		else
			return 1;
	};
	
	Template.game.isOpen = function() {
		var g = Games.findOne({_id:Session.get(GAME)});
		if (g) {
			return g.open || true;
		} else {
			return false;
		}
	};
	
	Template.game.isOwner = function() {
		var g = Games.findOne({_id:Session.get(GAME)});
		if (g) {
			if (g.ownerId) {
				return EJSON.equals(g.ownerId, playerIdForUserId(Session.get(GAME),Meteor.userId()));
			} else {
				return false;
			}
		} else {
			return false;
		}
	};
	
	Template.game.lastVote = function() {
		return Votes.findOne({gameId:Session.get(GAME),round:Session.get(ROUND)-1});
	};
	
	Template.game.rendered = refreshListviews;
	Template.game.created = createListviews;
    Template.game.preserve(defaultPreserve);

	Handlebars.registerHelper("gameGame",Template.game.game);
	Handlebars.registerHelper("gameTitle",Template.game.title);
	Handlebars.registerHelper("gameIsOpen",Template.game.isOpen);
	Handlebars.registerHelper("gameRound",Template.game.round);
	Handlebars.registerHelper("gameIsOwner",Template.game.isOwner);
	Handlebars.registerHelper("gameLastVote",Template.game.lastVote);

	Template.judge.isJudge = isJudge;

	Template.judge.judge = function() {
        var g = Games.findOne({_id:Session.get(GAME)});
        if (g)
		    return Meteor.users.findOne({_id:g.judgeId});
        else
            return null;
	}

	Template.judge.judgeEmailAddress = function() {
        if (playersCount() > 1) {
            if (isJudge())
                return "You are the judge!";
            else {
                var g = Games.findOne({_id:Session.get(GAME)});
                if (g)
                    return playerIdToName(g.judgeId);
                else
                    return "";
            }
        } else
            return "Waiting for more players...";
    }

	Template.judge.rendered = function () {
        refreshListviews();
        if (isJudge() && playersCount() > 1) {
            $('#submissionsCollapsible h3 a').addClass('magic');
        } else {
            $('#submissionsCollapsible h3 a').removeClass('magic');
        }
    }
	Template.judge.created = createListviews;
    Template.judge.preserve(defaultPreserve);

	Template.question.question = function() {
		var gameDoc = Games.findOne({_id:Session.get(GAME)});
		if (gameDoc) {
			return cardIdToText(gameDoc.questionId);
		} else {
			return "REDACTED.";
		}
	};

    Template.question.preserve(defaultPreserve);
    Template.question.rendered = refreshListviews;

	Template.players.players = function () {
		var players = _.pluck(Players.find({gameId:Session.get(CURRENT_GAME)}),"userId");
		return _.map(players, function (o) {return Meteor.users.findOne({_id:o})});
	};

	Template.players.rendered = refreshListviews;
	Template.players.created = createListviews;
    Template.players.preserve(defaultPreserve);

	Template.scores.scores = function() {
		if (!Session.get(GAME))
			return [];

		return scores(Session.get(GAME));
	};

	Template.scores.rendered = refreshListviews;
	Template.scores.created = createListviews;
    Template.scores.preserve(defaultPreserve);

	Template.browse.games = function() {
		return Games.find({open:true}).fetch();
	};

	Template.browse.events = {
		'click a': joinGameOnClick
	};

	Template.browse.rendered = refreshListviews;
	Template.browse.created = createListviews;
    Template.browse.preserve(defaultPreserve);

	Template.myGames.games = function() {
		return Games.find({open:true,userIds:Meteor.userId()}).fetch();
	};

	Template.myGames.events = {
		'click a': joinGameOnClick
	};

	Template.myGames.rendered = refreshListviews;
	Template.myGames.created = createListviews;
    Template.myGames.preserve(defaultPreserve);

    Template.submissions.isJudge = isJudge;
	Template.submissions.submissions = function () {
		var submissions = Submissions.find({gameId:Session.get(GAME),round:Session.get(ROUND)}).fetch();
		return _.map(submissions, function(o) {
            return _.extend({text:cardIdToText(o.answerId)},o)
        });
	};

    Template.submissions.count = function () {
        return "(" + submissionCount().toString() + "/" + maxSubmissionsCount().toString() + ")";
    };

	Template.submissions.events = {
		'click .submission':function(e) {
			var submissionId = $(e.target).attr('id');
			Session.set(PREVIEW_CARD,submissionIdToCardId(submissionId));
			previewYes = function () {
				Meteor.call("pickWinner",Session.get(GAME),submissionId,function(e,r){
					if (r) {
						Meteor.call("finishRound",Session.get(GAME),function (e,r){
							if (e) {
								console.log(e);
								Session.set(ERROR,e.reason);
							}
						});
					}
					if (e) {
						console.log(e);
						Session.set(ERROR,e.reason);
					}
				});
			};
		}
	}

	Template.submissions.rendered = refreshListviews;

	Template.submissions.created = createListviews;
    Template.submissions.preserve(defaultPreserve);

    Template.hand.isJudge = isJudge;

	Template.hand.hand = function () {
		return Hands.findOne({userId:Meteor.userId(),gameId:Session.get(GAME),round:Session.get(ROUND)});
	};

	Template.hand.cardsInHand = function() {
		var handDoc = Hands.findOne({userId:Meteor.userId(),gameId:Session.get(GAME),round:Session.get(ROUND)});
        if (handDoc)
		    return _.map(handDoc.hand, function (o) {return Cards.findOne({_id:o})});
        else
            return null;
	};

	Template.hand.events = {
		'click .card':function(e) {
			var answerId = $(e.target).attr('id');
			Session.set(PREVIEW_CARD,answerId);
			previewYes = function() {
				Meteor.call("submitAnswerCard",Session.get(GAME),answerId,function(e,r) {
					if (r) {
						Session.set(SUBMISSION,r);
					}
					if (e) {
						console.log(e);
						Session.set(ERROR,e.reason);
					}
				});
			};
		}
	};

	Template.hand.rendered = function() {
        refreshListviews();
        if (isJudge()) {
            $('#handHeader').text("Your Hand");
            $('#handCollapsible h3 a').removeClass('magic');
        } else {
            $('#handHeader').text("Play a Card");
            $('#handCollapsible h3 a').addClass('magic');
        }
    };

	Template.hand.created = createListviews;
    Template.hand.preserve(defaultPreserve);

	Template.preview.text = function() {
		var gameDoc = Games.findOne({_id:Session.get(GAME)});
		if (gameDoc)
			return questionAndAnswerText(gameDoc.questionId,Session.get(PREVIEW_CARD));
		else
			return "REDACTED.";
	};

    Template.menu.rendered = refreshListviews;
    Template.menu.created = createListviews;
};

var cordovaSetup = function() {
    // Startup for Cordova
    document.addEventListener('online', function(e) {
        Session.set(IS_CORDOVA,true);
    }, false);
};


//Meteor.subscribe("myOwnedGames");
Meteor.subscribe("cards");

Meteor.startup(function() {
	Session.set(ERROR,null);
	
	Meteor.autorun(function() {
		var currentGameId = Session.get(GAME);
        var currentRound = Session.get(ROUND);
		if (currentGameId) {
			Meteor.subscribe("submissions",currentGameId,currentRound);
			Meteor.subscribe("votesInGame",currentGameId);
			Meteor.subscribe("usersInGame",currentGameId);
            Meteor.subscribe("players",currentGameId);
            Meteor.subscribe("myGames",Meteor.userId());
            Meteor.subscribe("openGames");
            Meteor.subscribe("myHands");
		}
	});

	Accounts.ui.config({
		requestPermissions: {facebook: ['user_likes']},
		passwordSignupFields: 'USERNAME_AND_EMAIL'
	});
		
	// update current round
	Meteor.autorun(function() {
		var currentGameId = Session.get(GAME);
		var currentGame = Games.findOne({_id:currentGameId});
		if (currentGame)
			Session.set(ROUND,currentGame.round);
	});

    // Update logged in status (workaround for constant menu refreshing
    Meteor.autorun(function () {
        if (Session.get(IS_LOGGED_IN) !== Meteor.userId()) {
            Session.set(IS_LOGGED_IN,Meteor.userId())
        };
    })
	
	// clear error after 5 seconds
	Meteor.autorun(function () {
		var currentError = Session.get(ERROR);
		if (currentError !== null) {
			Meteor.setTimeout(function(){
				Session.set(ERROR,null);
			},5000);
		}
	});

	// update last login time
	Meteor.setInterval(function () {
        if (Meteor.userId()) {
            Meteor.call("heartbeat",Session.get(LOCATION) ? Session.get(LOCATION) : null,function(err,r){
                setError(err);
            });
        }
    },K_HEARTBEAT);

    // cordova setup
    Meteor.autorun(function () {
        if (Session.equals(IS_CORDOVA,true)) {
            console.log("Redacted Cordova detected.");
        }
    });

    // refresh the listviews when appropriate
	mutationObserver = new MutationSummary({
		queries: [{element:'li'},{element:'[data-role="button"]'}],
		callback: function(summaries) {
            refreshListviews();
		}
	});

    requestLocation(setError);
});

registerTemplates();

cordovaSetup();
