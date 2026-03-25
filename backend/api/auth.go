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
	api.router.POST("/api/setup", api.handleSetup)
	api.router.GET("/api/users-exists", api.checkUsersExist)
	api.routes.PUT("/password", api.updatePassword)
	api.routes.POST("/reset-password", api.handleResetPassword)

	api.routes.GET("/users", api.getUsers)
	api.routes.POST("/users", api.createUser)
	api.routes.DELETE("/users", api.deleteUser)
	api.routes.PUT("/users/password", api.updateUserPassword)

	// Current user endpoint - returns the currently logged-in username
	api.routes.GET("/current-user", api.getCurrentUser)

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
		// Check if user must reset password
		dbUser, err := api.UserService.GetUserByUsername(loginUser.Username)
		if err == nil && dbUser != nil && dbUser.MustResetPassword {
			// User must reset password, return special response without setting cookie
			c.JSON(http.StatusOK, gin.H{
				"message":           "Password reset required",
				"mustResetPassword": true,
				"username":          loginUser.Username,
			})
			return
		}

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

// getCurrentUser returns the currently logged-in user's username
func (api *API) getCurrentUser(c *gin.Context) {
	// Get the currently logged-in user from the context (set by auth middleware)
	currentUser, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	currentUsername := currentUser.(string)

	c.JSON(http.StatusOK, gin.H{"username": currentUsername})
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

// handleResetPassword handles password reset for users who must reset their password
func (api *API) handleResetPassword(c *gin.Context) {
	type resetPasswordRequest struct {
		Username    string `json:"username"`
		NewPassword string `json:"newPassword"`
	}

	var req resetPasswordRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	if req.Username == "" || req.NewPassword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username and new password are required"})
		return
	}

	// Verify the user exists and must reset password
	dbUser, err := api.UserService.GetUserByUsername(req.Username)
	if err != nil || dbUser == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User not found"})
		return
	}

	if !dbUser.MustResetPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password reset not required for this user"})
		return
	}

	// Update the password
	if err := api.UserService.UpdatePassword(req.Username, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unable to update password"})
		return
	}

	// Clear the MustResetPassword flag
	if err := api.UserService.SetMustResetPassword(req.Username, false); err != nil {
		log.Error("Failed to clear mustResetPassword for user %s: %v", req.Username, err)
	}

	logMsg := fmt.Sprintf("Password reset for user '%s'", req.Username)
	api.DNSServer.AuditService.CreateAudit(&audit.Entry{
		Topic:   audit.TopicUser,
		Message: logMsg,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Password reset successful"})
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

	// Get the currently logged-in user
	currentUser, exists := c.Get("username")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	currentUsername := currentUser.(string)

	// Check if trying to delete the currently logged-in user
	if username == currentUsername {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete your own account"})
		return
	}

	// Check if this is the last user
	users, err := api.UserService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check users"})
		return
	}
	if len(users) <= 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot delete the last user"})
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

func (api *API) checkUsersExist(c *gin.Context) {
	users, err := api.UserService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check users"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"exists": len(users) > 0})
}

func (api *API) handleSetup(c *gin.Context) {
	// Check if users already exist
	users, err := api.UserService.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check users"})
		return
	}

	if len(users) > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Setup already completed"})
		return
	}

	type setupRequest struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	var req setupRequest
	if err := c.BindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Validate credentials
	if err := api.UserService.ValidateCredentials(user.User{Username: req.Username, Password: req.Password}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Create the admin user
	if err := api.UserService.CreateUser(req.Username, req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Generate token and set cookie
	token, err := generateToken(req.Username, api.Config.API.JWTSecret)
	if err != nil {
		log.Info("Token generation failed for user %s: %v", req.Username, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Authentication service temporarily unavailable",
		})
		return
	}

	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Access-Control-Allow-Credentials", "true")
	setAuthCookie(c.Writer, token)
	c.JSON(http.StatusCreated, gin.H{"message": "Setup completed successfully"})
}
