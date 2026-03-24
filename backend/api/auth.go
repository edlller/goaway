package api

import (
	"context"
	"encoding/json"
	"fmt"
	"goaway/backend/alert"
	"goaway/backend/audit"
	"goaway/backend/user"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (api *API) registerAuthRoutes() {
	api.router.POST("/api/login", api.handleLogin)
	api.router.GET("/api/authentication", api.getAuthentication)
	api.routes.PUT("/password", api.updatePassword)

	api.routes.GET("/users", api.getUsers)
	api.routes.POST("/users", api.createUser)
	api.routes.DELETE("/users", api.deleteUser)
	api.routes.PUT("/users/password", api.updateUserPassword)

	api.routes.POST("/apiKey", api.createAPIKey)
	api.routes.GET("/apiKey", api.getAPIKeys)
	api.routes.GET("/deleteApiKey", api.deleteAPIKey)
}

func (api *API) handleLogin(c *gin.Context) {
	allowed, timeUntilReset := api.RateLimiter.CheckLimit(c.ClientIP())
	if !allowed {
		c.JSON(http.StatusTooManyRequests, gin.H{
			"error":             "Too many login attempts. Please try again later.",
			"retryAfterSeconds": timeUntilReset,
		})
		return
	}

	var loginUser user.User
	if err := c.BindJSON(&loginUser); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if err := api.UserService.ValidateCredentials(loginUser); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	if api.UserService.Authenticate(loginUser.Username, loginUser.Password) {
		token, err := generateToken(loginUser.Username, api.Config.API.JWTSecret)
		if err != nil {
			log.Info("Token generation failed for user %s: %v", loginUser.Username, err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Authentication service temporarily unavailable",
			})
			return
		}

		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Credentials", "true")

		setAuthCookie(c.Writer, token)
		c.JSON(http.StatusOK, gin.H{"message": "Login successful"})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid username or password",
		})
	}
}

func (api *API) getAuthentication(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"enabled": api.Authentication})
}

func (api *API) updatePassword(c *gin.Context) {
	type passwordChange struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}

	var newCredentials passwordChange
	if err := c.BindJSON(&newCredentials); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if !api.UserService.Authenticate("admin", newCredentials.CurrentPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Current password is not valid"})
		return
	}

	if err := api.UserService.UpdatePassword("admin", newCredentials.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unable to update password"})
		return
	}

	logMsg := "Password changed for user 'admin'"
	api.DNSServer.AuditService.CreateAudit(&audit.Entry{
		Topic:   audit.TopicUser,
		Message: logMsg,
	})
	go func() {
		_ = api.DNSServer.AlertService.SendToAll(context.Background(), alert.Message{
			Title:    "System",
			Content:  logMsg,
			Severity: SeverityWarning,
		})
	}()

	log.Warning("%s", logMsg)
	c.Status(http.StatusOK)
}

func (api *API) createAPIKey(c *gin.Context) {
	type NewAPIKeyName struct {
		Name string `json:"name"`
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Error("Failed to read request body: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	var request NewAPIKeyName
	if err := json.Unmarshal(body, &request); err != nil {
		log.Error("Failed to parse JSON: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format"})
		return
	}

	apiKey, err := api.KeyService.CreateKey(request.Name)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	go func() {
		_ = api.DNSServer.AlertService.SendToAll(context.Background(), alert.Message{
			Title:    "System",
			Content:  fmt.Sprintf("New API key created with the name '%s'", request.Name),
			Severity: SeverityWarning,
		})
	}()

	c.JSON(http.StatusOK, apiKey)
}

func (api *API) getAPIKeys(c *gin.Context) {
	apiKeys, err := api.KeyService.GetAllKeys()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, apiKeys)
}

func (api *API) deleteAPIKey(c *gin.Context) {
	keyName := c.Query("name")

	err := api.KeyService.DeleteKey(keyName)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deleted api key!"})
}

func (api *API) getUsers(c *gin.Context) {
	users, err := api.UserService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}

	userList := make([]gin.H, len(users))
	for i, u := range users {
		userList[i] = gin.H{
			"username":  u.Username,
			"createdAt": u.CreatedAt,
			"updatedAt": u.UpdatedAt,
		}
	}

	c.JSON(http.StatusOK, userList)
}

func (api *API) createUser(c *gin.Context) {
	type newUser struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	var u newUser
	if err := c.BindJSON(&u); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if err := api.UserService.ValidateCredentials(user.User{Username: u.Username, Password: u.Password}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if api.UserService.Exists(u.Username) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User already exists"})
		return
	}

	if err := api.UserService.CreateUser(u.Username, u.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User created successfully"})
}

func (api *API) deleteUser(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username is required"})
		return
	}

	if username == "admin" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete admin user"})
		return
	}

	if err := api.UserService.DeleteUser(username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}

func (api *API) updateUserPassword(c *gin.Context) {
	type passwordChange struct {
		Username    string `json:"username"`
		NewPassword string `json:"newPassword"`
	}

	var request passwordChange
	if err := c.BindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if request.Username == "" || request.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username and new password are required"})
		return
	}

	if err := api.UserService.UpdatePassword(request.Username, request.NewPassword); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Password updated successfully"})
}
