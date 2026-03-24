package user

import (
	"context"
	"errors"
	"goaway/backend/database"

	"gorm.io/gorm"
)

type Repository interface {
	Create(user *database.User) error
	FindByUsername(username string) (*User, error)
	FindAll() ([]*database.User, error)
	Delete(username string) error
	UpdatePassword(username string, hashedPassword string) error
}

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(user *database.User) error {
	result := r.db.Create(user)
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("user creation failed: no rows affected")
	}

	return nil
}

func (r *repository) FindByUsername(username string) (*User, error) {
	var user database.User
	err := r.db.Where("username = ?", username).Find(&user).Error
	if err != nil {
		return nil, err
	}

	if user.Username == "" {
		return nil, errors.New("user not found")
	}

	return &User{
		Username: user.Username,
		Password: user.Password,
	}, nil
}

func (r *repository) UpdatePassword(username, hashedPassword string) error {
	affected, err := gorm.G[database.User](r.db).Where("username = ?", username).Update(context.Background(), "password", hashedPassword)
	if err != nil {
		return err
	}

	if affected == 0 {
		return errors.New("password update failed: no rows affected")
	}

	return nil
}

func (r *repository) FindAll() ([]*database.User, error) {
	var users []database.User
	err := r.db.Find(&users).Error
	if err != nil {
		return nil, err
	}

	result := make([]*database.User, len(users))
	for i := range users {
		result[i] = &users[i]
	}

	return result, nil
}

func (r *repository) Delete(username string) error {
	result := r.db.Where("username = ?", username).Delete(&database.User{})
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("user not found")
	}

	return nil
}
