
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: str = "draft"
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    budget: float = Field(default=0, ge=0)
    revenue: float = Field(default=0, ge=0)
    platform: Optional[str] = None
    objectives: Optional[str] = None

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("End date cannot be earlier than start date.")
        return self


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    status: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    budget: float = 0
    revenue: float = 0
    platform: Optional[str] = None
    objectives: Optional[str] = None
